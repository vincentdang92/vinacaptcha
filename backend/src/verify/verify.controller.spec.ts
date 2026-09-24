import { Test, TestingModule } from '@nestjs/testing';
import { ValidationPipe } from '@nestjs/common';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { DataSource } from 'typeorm';
import { vi } from 'vitest';
import { VerifyController } from './verify.controller.js';
import { VerifyService } from './verify.service.js';
import { RedisService } from '../redis/redis.service.js';
import { ReputationService } from '../reputation/reputation.service.js';

describe('VerifyController', () => {
  let controller: VerifyController;

  const mockVerifyService = {
    verifyCaptcha: () => Promise.resolve({ success: true }),
    siteVerify: () => Promise.resolve({ success: true }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VerifyController],
      providers: [
        {
          provide: VerifyService,
          useValue: mockVerifyService,
        },
      ],
    }).compile();

    controller = module.get<VerifyController>(VerifyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // Nhiều backend khách coi mọi mã khác 2xx là "server captcha lỗi" và cho qua — input xấu do bot
  // kiểm soát (thiếu / rỗng / sai kiểu verify_token) phải ra HTTP 200 success:false, không bao giờ 4xx.
  describe('POST /v1/siteverify HTTP status contract', () => {
    let app: NestFastifyApplication;
    const mockDataSource = { query: vi.fn() };
    const mockRedisService = { useOneTimeToken: vi.fn(), setOneTimeToken: vi.fn(), trackRequestEvent: vi.fn() };

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [VerifyController],
        providers: [
          VerifyService,
          { provide: DataSource, useValue: mockDataSource },
          { provide: RedisService, useValue: mockRedisService },
          { provide: ReputationService, useValue: { recordVerificationFailure: vi.fn() } },
        ],
      }).compile();

      app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter());
      // Cùng cấu hình với main.ts
      app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
      await app.close();
    });

    afterEach(() => {
      // reset (không chỉ clear) để giá trị mockResolvedValueOnce chưa dùng không rò sang test sau
      vi.resetAllMocks();
    });

    const siteverify = (payload: unknown) =>
      app.getHttpAdapter().getInstance().inject({ method: 'POST', url: '/v1/siteverify', payload: payload as any });

    it.each([
      { secret: 'cap_live_good' },
      { secret: 'cap_live_good', verify_token: '' },
      { secret: 'cap_live_good', verify_token: 123 },
      { secret: 'cap_live_good', verify_token: { $ne: null } },
    ])('returns 200 success:false for a missing/invalid verify_token: %j', async (payload) => {
      const res = await siteverify(payload);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: false, reason: 'missing_verify_token' });
    });

    it('returns 200 success:false when the secret is missing', async () => {
      const res = await siteverify({ verify_token: 'vt_abc' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: false, reason: 'missing_secret' });
    });

    it('tolerates extra fields (e.g. reCAPTCHA-style remoteip) instead of rejecting with 400', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ site_id: 'site-1', revoked_at: null }]);
      mockRedisService.useOneTimeToken.mockResolvedValueOnce(null);

      const res = await siteverify({ secret: 'cap_live_good', verify_token: 'vt_abc', remoteip: '1.2.3.4' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ success: false, reason: 'already_used' });
    });

    it('still returns 503 on internal errors so clients can apply their 5xx policy', async () => {
      mockDataSource.query.mockRejectedValueOnce(new Error('pool exhausted'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const res = await siteverify({ secret: 'cap_live_good', verify_token: 'vt_abc' });
      expect(res.statusCode).toBe(503);
      expect(res.json()).toMatchObject({ error: { code: 'service_unavailable' } });
      consoleSpy.mockRestore();
    });
  });
});
