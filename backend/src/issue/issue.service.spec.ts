import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { IssueService } from './issue.service.js';
import { RiskEngineService } from '../risk-engine/risk-engine.service.js';
import { RedisService } from '../redis/redis.service.js';
import { DataSource } from 'typeorm';
import { UnauthorizedException, ForbiddenException } from '@nestjs/common';
import { IssueTokenDto } from './dto/issue.dto.js';

describe('IssueService', () => {
  let service: IssueService;

  const mockRiskEngineService = {
    evaluateRisk: vi.fn(),
  };

  const mockRedisService = {
    getApiKeyMetadataCache: vi.fn().mockResolvedValue(null),
    setApiKeyMetadataCache: vi.fn().mockResolvedValue(undefined),
    checkAndIncrementQuota: vi.fn().mockResolvedValue({ allowed: true, current: 1, limit: 10000 }),
    setOneTimeToken: vi.fn(),
    trackRequestEvent: vi.fn().mockResolvedValue(undefined),
  };

  const mockDataSource = {
    query: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IssueService,
        { provide: RiskEngineService, useValue: mockRiskEngineService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: DataSource, useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<IssueService>(IssueService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('issueToken', () => {
    it('should throw UnauthorizedException if API key is invalid', async () => {
      mockDataSource.query.mockResolvedValue([]);

      const dto = { client_signals: {}, honeypot_filled: false } as IssueTokenDto;

      await expect(service.issueToken('invalid_key', dto, '1.2.3.4')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException if API key is revoked', async () => {
      mockDataSource.query.mockResolvedValue([{ id: 1, site_id: 1, revoked_at: new Date() }]);

      const dto = { client_signals: {}, honeypot_filled: false } as IssueTokenDto;

      await expect(service.issueToken('revoked_key', dto, '1.2.3.4')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw ForbiddenException if domain does not match', async () => {
      mockDataSource.query.mockResolvedValue([{ 
        id: 1, 
        site_id: 1, 
        revoked_at: null,
        platform: 'web',
        primary_domain: 'example.com',
        allowed_domains: []
      }]);

      const dto = { domain: 'hacker.com', client_signals: {}, honeypot_filled: false } as IssueTokenDto;

      await expect(service.issueToken('valid_key', dto, '1.2.3.4')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should return session data and store in Redis if API key and domain are valid', async () => {
      mockDataSource.query.mockResolvedValue([{ 
        id: 1, 
        site_id: 1, 
        revoked_at: null,
        platform: 'web',
        primary_domain: 'example.com',
        allowed_domains: []
      }]);
      
      const mockRiskEval = {
        challengeType: 'none',
        powDifficulty: null,
        riskScore: 10,
        breakdown: {},
      };
      mockRiskEngineService.evaluateRisk.mockResolvedValue(mockRiskEval);

      const dto = { domain: 'example.com', client_signals: {}, honeypot_filled: false } as IssueTokenDto;
      const clientIp = '192.168.1.1';

      const result = await service.issueToken('valid_key', dto, clientIp);

      expect(result).toHaveProperty('session_id');
      expect(result.challenge_type).toBe('none');
      expect(result.expires_in).toBe(60);

      expect(mockRedisService.setOneTimeToken).toHaveBeenCalledWith(
        `session:${result.session_id}`,
        60,
        expect.any(String),
      );
    });

    it('should respect site challenge_mode slider setting', async () => {
      mockDataSource.query.mockResolvedValue([{ 
        id: 1, 
        site_id: 1, 
        revoked_at: null,
        platform: 'web',
        primary_domain: 'example.com',
        allowed_domains: [],
        challenge_mode: 'slider',
      }]);
      
      mockRiskEngineService.evaluateRisk.mockResolvedValue({
        challengeType: 'none', // risk score is safe, but site forces slider
        powDifficulty: null,
        riskScore: 5,
        breakdown: {},
      });

      const dto = { domain: 'example.com', client_signals: {}, honeypot_filled: false } as IssueTokenDto;
      const result = await service.issueToken('valid_key', dto, '1.2.3.4');

      expect(result.challenge_type).toBe('slider');
      expect(result.slider_data).toBeDefined();
    });

    it('should respect site challenge_mode pow setting', async () => {
      mockDataSource.query.mockResolvedValue([{ 
        id: 1, 
        site_id: 1, 
        revoked_at: null,
        platform: 'web',
        primary_domain: 'example.com',
        allowed_domains: [],
        challenge_mode: 'pow',
      }]);
      
      mockRiskEngineService.evaluateRisk.mockResolvedValue({
        challengeType: 'none',
        powDifficulty: null,
        riskScore: 5,
        breakdown: {},
      });

      const dto = { domain: 'example.com', client_signals: {}, honeypot_filled: false } as IssueTokenDto;
      const result = await service.issueToken('valid_key', dto, '1.2.3.4');

      expect(result.challenge_type).toBe('pow');
      expect(result.pow_difficulty).toBe(12);
    });

    describe('force_challenge (client chỉ được nâng mức, không được hạ)', () => {
      const mockSite = (challengeMode: string) =>
        mockDataSource.query.mockResolvedValue([{
          id: 1,
          site_id: 1,
          revoked_at: null,
          platform: 'web',
          primary_domain: 'example.com',
          allowed_domains: [],
          challenge_mode: challengeMode,
        }]);
      const mockRisk = (challengeType: 'none' | 'slider' | 'pow', powDifficulty: number | null = null) =>
        mockRiskEngineService.evaluateRisk.mockResolvedValue({ challengeType, powDifficulty, riskScore: 50, breakdown: {} });
      const issueWith = (force_challenge?: string) =>
        service.issueToken(
          'valid_key',
          { domain: 'example.com', client_signals: {}, honeypot_filled: false, force_challenge } as IssueTokenDto,
          '1.2.3.4',
        );

      it.each(['none', 'auto'])('cannot downgrade a slider site with force_challenge=%s', async (force) => {
        mockSite('slider');
        mockRisk('none');
        const result = await issueWith(force);
        expect(result.challenge_type).toBe('slider');
      });

      it('cannot downgrade a pow challenge chosen by the risk engine', async () => {
        mockSite('auto');
        mockRisk('pow', 18);
        for (const force of ['none', 'slider']) {
          const result = await issueWith(force);
          expect(result.challenge_type).toBe('pow');
          expect(result.pow_difficulty).toBe(18);
        }
      });

      it('can still escalate an invisible challenge to slider (login forms)', async () => {
        mockSite('auto');
        mockRisk('none');
        const result = await issueWith('slider');
        expect(result.challenge_type).toBe('slider');
        expect(result.slider_data).toBeDefined();
      });

      it('can escalate slider to pow with the default difficulty', async () => {
        mockSite('slider');
        mockRisk('none');
        const result = await issueWith('pow');
        expect(result.challenge_type).toBe('pow');
        expect(result.pow_difficulty).toBe(12);
      });

      it('stores the effective (not the requested) challenge type in the session', async () => {
        mockSite('slider');
        mockRisk('none');
        await issueWith('none');
        const sessionJson = mockRedisService.setOneTimeToken.mock.calls.at(-1)?.[2];
        expect(JSON.parse(sessionJson).challengeType).toBe('slider');
      });
    });

    it('should throw ForbiddenException and log failure when IP is banned', async () => {
      mockDataSource.query.mockResolvedValue([{ 
        id: 1, 
        site_id: 'site-123', 
        revoked_at: null,
        platform: 'web',
        primary_domain: 'example.com',
        allowed_domains: [],
      }]);

      mockRiskEngineService.evaluateRisk.mockResolvedValue({
        challengeType: 'pow',
        powDifficulty: 18,
        riskScore: 100,
        breakdown: {
          isBannedIp: true,
          reputationScore: 100,
        },
      });

      const dto = { domain: 'example.com', client_signals: {}, honeypot_filled: false } as IssueTokenDto;
      
      await expect(service.issueToken('valid_key', dto, '1.2.3.4')).rejects.toThrow(
        ForbiddenException,
      );

      // Verify log was recorded
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO verification_logs'),
        expect.arrayContaining(['site-123', expect.any(String), '1.2.3.4', 100, 'none', 'fail']),
      );

      // Verify event was tracked
      expect(mockRedisService.trackRequestEvent).toHaveBeenCalledWith(
        'site-123',
        'verify_fail',
        'none',
      );
    });

    it('should throw ForbiddenException when IP exceeds multi-tier rate limit (e.g. 13 requests in 10 minutes)', async () => {
      mockDataSource.query.mockResolvedValue([{ 
        id: 1, 
        site_id: 'site-456', 
        revoked_at: null,
        platform: 'web',
        primary_domain: 'example.com',
        allowed_domains: [],
      }]);

      mockRiskEngineService.evaluateRisk.mockResolvedValue({
        challengeType: 'slider',
        powDifficulty: null,
        riskScore: 60,
        breakdown: {
          isRateLimitExceeded: true,
          rateLimitScore: 60,
          rateLimitCounts: { count10s: 1, count5m: 8, count1h: 13 },
        },
      });

      const dto = { domain: 'example.com', client_signals: {}, honeypot_filled: false } as IssueTokenDto;
      
      await expect(service.issueToken('valid_key', dto, '116.96.46.193')).rejects.toThrow(
        ForbiddenException,
      );

      // Verify log was recorded with fail
      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO verification_logs'),
        expect.arrayContaining(['site-456', expect.any(String), '116.96.46.193', 60, 'none', 'fail']),
      );

      // Verify tracking event
      expect(mockRedisService.trackRequestEvent).toHaveBeenCalledWith(
        'site-456',
        'verify_fail',
        'none',
      );
    });
  });
});
