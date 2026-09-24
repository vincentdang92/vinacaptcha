import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { Test } from '@nestjs/testing';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { TRUSTED_PROXY_RANGES, resolveClientIp } from './client-ip.js';
import { VerifyController } from '../verify/verify.controller.js';
import { VerifyService } from '../verify/verify.service.js';

describe('client-ip', () => {
  describe('resolveClientIp', () => {
    const originalEnv = process.env.NODE_ENV;

    afterEach(() => {
      process.env.NODE_ENV = originalEnv;
    });

    it('returns a valid request IP unchanged', () => {
      expect(resolveClientIp('203.0.113.9')).toBe('203.0.113.9');
      expect(resolveClientIp('2001:db8::1')).toBe('2001:db8::1');
    });

    it('replaces missing or malformed IPs with 0.0.0.0 (the ip column is INET)', () => {
      expect(resolveClientIp(undefined)).toBe('0.0.0.0');
      expect(resolveClientIp('abc')).toBe('0.0.0.0');
      expect(resolveClientIp("1.2.3.4'; DROP TABLE x;--")).toBe('0.0.0.0');
    });

    it('dev: uses the widget-reported IP only when the connection is loopback', () => {
      process.env.NODE_ENV = 'development';
      expect(resolveClientIp('127.0.0.1', '198.51.100.7')).toBe('198.51.100.7');
      expect(resolveClientIp('203.0.113.9', '198.51.100.7')).toBe('203.0.113.9');
      expect(resolveClientIp('127.0.0.1', 'not-an-ip')).toBe('127.0.0.1');
    });

    it('production: never trusts the widget-reported IP', () => {
      process.env.NODE_ENV = 'production';
      expect(resolveClientIp('127.0.0.1', '198.51.100.7')).toBe('127.0.0.1');
    });
  });

  describe('trustProxy + @Ip() through Fastify', () => {
    let app: NestFastifyApplication;
    const verifyChallenge = vi.fn().mockResolvedValue({ result: 'pass' });

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        controllers: [VerifyController],
        providers: [{ provide: VerifyService, useValue: { verifyChallenge } }],
      }).compile();

      app = moduleRef.createNestApplication<NestFastifyApplication>(
        new FastifyAdapter({ trustProxy: TRUSTED_PROXY_RANGES }),
      );
      await app.init();
      await app.getHttpAdapter().getInstance().ready();
    });

    afterAll(async () => {
      await app.close();
    });

    afterEach(() => {
      verifyChallenge.mockClear();
    });

    const ipSeenByController = async (remoteAddress: string, forwardedFor?: string) => {
      await app.getHttpAdapter().getInstance().inject({
        method: 'POST',
        url: '/v1/verify',
        payload: { session_id: '00000000-0000-0000-0000-000000000000' },
        remoteAddress,
        headers: forwardedFor ? { 'x-forwarded-for': forwardedFor } : {},
      });
      return verifyChallenge.mock.calls.at(-1)?.[1];
    };

    it('behind the gateway: ignores the client-supplied part of X-Forwarded-For', async () => {
      // nginx ($proxy_add_x_forwarded_for) nối IP thật vào sau giá trị client tự gửi
      expect(await ipSeenByController('172.18.0.5', '6.6.6.6, 203.0.113.9')).toBe('203.0.113.9');
    });

    it('behind the gateway (nginx overwrites the header): uses the real client IP', async () => {
      expect(await ipSeenByController('172.18.0.5', '203.0.113.9')).toBe('203.0.113.9');
    });

    it('spoofed private addresses in the header are skipped as well', async () => {
      expect(await ipSeenByController('172.18.0.5', '10.0.0.1, 203.0.113.9')).toBe('203.0.113.9');
    });

    it('direct connection from a public IP: X-Forwarded-For is ignored entirely', async () => {
      expect(await ipSeenByController('198.51.100.20', '6.6.6.6')).toBe('198.51.100.20');
    });
  });
});
