import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { VerifyService } from './verify.service.js';
import { RedisService } from '../redis/redis.service.js';
import { ReputationService } from '../reputation/reputation.service.js';
import { DataSource } from 'typeorm';
import * as crypto from 'crypto';
import { ServiceUnavailableException } from '@nestjs/common';

describe('VerifyService', () => {
  let service: VerifyService;

  const mockRedisService = {
    useOneTimeToken: vi.fn(),
    setOneTimeToken: vi.fn(),
    trackRequestEvent: vi.fn().mockResolvedValue(undefined),
  };

  const mockReputationService = {
    recordVerificationFailure: vi.fn(),
  };

  const mockDataSource = {
    query: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VerifyService,
        { provide: RedisService, useValue: mockRedisService },
        { provide: ReputationService, useValue: mockReputationService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<VerifyService>(VerifyService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('verifyChallenge', () => {
    it('should return expired if token not in redis', async () => {
      mockRedisService.useOneTimeToken.mockResolvedValue(null);
      const result = await service.verifyChallenge({ session_id: '123' }, '1.2.3.4');
      expect(result).toEqual({ result: 'expired', reason: 'session_expired' });
    });

    it('should pass if none challenge (invisible mode)', async () => {
      mockRedisService.useOneTimeToken.mockResolvedValue(JSON.stringify({
        siteId: 1,
        challengeType: 'none',
        riskScore: 10,
      }));
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.verifyChallenge({
        session_id: '123',
      }, '1.2.3.4');

      expect(result.result).toBe('pass');
      expect(result.verify_token).toMatch(/^vt_/);
    });

    it.each([undefined, 'auto', 'captcha'])(
      'should fail if the session challenge type is unknown (%s)',
      async (challengeType) => {
        mockRedisService.useOneTimeToken.mockResolvedValue(JSON.stringify({ siteId: 1, challengeType, riskScore: 10 }));
        mockDataSource.query.mockResolvedValue([]);

        const result = await service.verifyChallenge({ session_id: '123' }, '1.2.3.4');

        expect(result.result).toBe('fail');
        expect(result.reason).toBe('unknown_challenge_type');
        expect(result.verify_token).toBeUndefined();
      },
    );

    it('should pass if slider challenge is solved within tolerance', async () => {
      mockRedisService.useOneTimeToken.mockResolvedValue(JSON.stringify({
        siteId: 1,
        challengeType: 'slider',
        targetX: 120,
        sliderTolerance: 5,
        riskScore: 40,
      }));
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.verifyChallenge({
        session_id: '123',
        challenge_response: { type: 'slider', final_position: 122, drag_duration_ms: 450 },
      }, '1.2.3.4');

      expect(result.result).toBe('pass');
      expect(result.verify_token).toMatch(/^vt_/);
      expect(mockRedisService.setOneTimeToken).toHaveBeenCalled();
    });

    it('should fail if slider challenge position is out of tolerance', async () => {
      mockRedisService.useOneTimeToken.mockResolvedValue(JSON.stringify({
        siteId: 1,
        challengeType: 'slider',
        targetX: 120,
        sliderTolerance: 5,
        riskScore: 40,
      }));
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.verifyChallenge({
        session_id: '123',
        challenge_response: { type: 'slider', final_position: 140 },
      }, '1.2.3.4');

      expect(result.result).toBe('fail');
      expect(result.reason).toBe('slider_position_incorrect');
      expect(mockReputationService.recordVerificationFailure).toHaveBeenCalledWith('1.2.3.4', 1);
    });

    it('should pass if pow challenge nonce is valid', async () => {
      const sessionId = 'test-session-pow';
      let validNonce = 0;
      while (true) {
        const hash = crypto.createHash('sha256').update(`${sessionId}:${validNonce}`).digest();
        if (hash[0] === 0) break; // 8 leading zero bits
        validNonce++;
      }

      mockRedisService.useOneTimeToken.mockResolvedValue(JSON.stringify({
        siteId: 1,
        challengeType: 'pow',
        powDifficulty: 8,
        riskScore: 80,
      }));
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.verifyChallenge({
        session_id: sessionId,
        challenge_response: { type: 'pow', nonce: validNonce.toString() },
      }, '1.2.3.4');

      expect(result.result).toBe('pass');
      expect(result.verify_token).toMatch(/^vt_/);
    });

    it('should fail if pow challenge nonce is invalid', async () => {
      mockRedisService.useOneTimeToken.mockResolvedValue(JSON.stringify({
        siteId: 1,
        challengeType: 'pow',
        powDifficulty: 16,
        riskScore: 80,
      }));
      mockDataSource.query.mockResolvedValue([]);

      const result = await service.verifyChallenge({
        session_id: 'pow-fail-sess',
        challenge_response: { type: 'pow', nonce: 'invalid_nonce_123' },
      }, '1.2.3.4');

      expect(result.result).toBe('fail');
      expect(result.reason).toBe('pow_difficulty_insufficient');
    });
  });

  describe('siteVerify', () => {
    it.each([
      [undefined, 'missing_verify_token'],
      ['', 'missing_verify_token'],
      ['   ', 'missing_verify_token'],
      [123, 'missing_verify_token'],
      [{ $ne: null }, 'missing_verify_token'],
    ])('should return success:false without touching DB/Redis when verify_token is %j', async (verify_token, reason) => {
      const result = await service.siteVerify({ secret: 'cap_live_good', verify_token });
      expect(result).toEqual({ success: false, reason });
      expect(mockDataSource.query).not.toHaveBeenCalled();
      expect(mockRedisService.useOneTimeToken).not.toHaveBeenCalled();
    });

    it.each([undefined, null, 'not-an-object', {}, { secret: '' }, { secret: 42, verify_token: 'vt_x' }])(
      'should return success:false (missing_secret) for body %j',
      async (body) => {
        const result = await service.siteVerify(body as any);
        expect(result).toEqual({ success: false, reason: 'missing_secret' });
        expect(mockDataSource.query).not.toHaveBeenCalled();
      },
    );

    it('should fail if secret is invalid', async () => {
      mockDataSource.query.mockResolvedValue([]);
      const result = await service.siteVerify({ secret: 'bad', verify_token: '123' });
      expect(result.success).toBe(false);
      expect(result.reason).toBe('invalid_secret');
    });

    it('should fail if verify_token is already used or expired', async () => {
      mockDataSource.query.mockResolvedValue([{ site_id: 1, revoked_at: null }]);
      mockRedisService.useOneTimeToken.mockResolvedValue(null); // not found

      const result = await service.siteVerify({ secret: 'good', verify_token: '123' });
      expect(result.success).toBe(false);
      expect(result.reason).toBe('already_used');
    });

    it('should succeed and return score if valid', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ site_id: 1, revoked_at: null }]); // api_keys
      mockRedisService.useOneTimeToken.mockResolvedValue(JSON.stringify({ siteId: 1, score: 25 }));
      mockDataSource.query.mockResolvedValueOnce([{ primary_domain: 'example.com' }]); // sites

      const result = await service.siteVerify({ secret: 'good', verify_token: '123' });
      
      expect(result.success).toBe(true);
      expect(result.score).toBe(25);
      expect(result.risk_level).toBe('low');
      expect(result.hostname).toBe('example.com');
    });

    it('should fail closed with 503 (never success) if an unexpected database error occurs', async () => {
      mockDataSource.query.mockRejectedValue(new Error('DB Connection Timeout'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const promise = service.siteVerify({ secret: 'cap_live_secret_value', verify_token: 'forged_token' });
      await expect(promise).rejects.toBeInstanceOf(ServiceUnavailableException);
      await expect(promise).rejects.toMatchObject({
        response: { error: { code: 'service_unavailable' } },
      });

      // Log không được chứa secret
      expect(consoleSpy.mock.calls.flat().join(' ')).not.toContain('cap_live_secret_value');
      consoleSpy.mockRestore();
    });

    it('should fail closed with 503 if Redis fails while consuming the token', async () => {
      mockDataSource.query.mockResolvedValueOnce([{ site_id: 1, revoked_at: null }]);
      mockRedisService.useOneTimeToken.mockRejectedValue(new Error('ECONNREFUSED'));
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await expect(service.siteVerify({ secret: 'good', verify_token: '123' })).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
      consoleSpy.mockRestore();
    });
  });
});
