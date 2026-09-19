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
  });
});
