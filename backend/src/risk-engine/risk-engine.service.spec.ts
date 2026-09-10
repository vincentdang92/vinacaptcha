import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { RiskEngineService } from './risk-engine.service.js';
import { ThreatIntelService } from '../threat-intel/threat-intel.service.js';
import { ReputationService } from '../reputation/reputation.service.js';
import { RedisService } from '../redis/redis.service.js';
import { ClientSignalsDto } from '../issue/dto/issue.dto.js';

describe('RiskEngineService', () => {
  let service: RiskEngineService;

  const mockThreatIntelService = {
    checkIp: vi.fn(),
  };

  const mockReputationService = {
    checkIpReputation: vi.fn(),
  };

  const mockRedisService = {
    incrementRateLimit: vi.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RiskEngineService,
        { provide: ThreatIntelService, useValue: mockThreatIntelService },
        { provide: ReputationService, useValue: mockReputationService },
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    service = module.get<RiskEngineService>(RiskEngineService);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('evaluateRisk', () => {
    it('should return challengeType "none" for safe IP and normal behavior', async () => {
      mockThreatIntelService.checkIp.mockResolvedValue({ matched: false });
      mockReputationService.checkIpReputation.mockResolvedValue({ hasRecord: false });
      mockRedisService.incrementRateLimit.mockResolvedValue(1);

      const signals: ClientSignalsDto = {
        webdriver: false,
        canvas_fingerprint: 'abcd123',
        time_on_page_ms: 3000, // Safe time
        mouse_moves: 100,
        mouse_clicks: 2,
        key_strokes: 15,
      };

      const result = await service.evaluateRisk('1.2.3.4', signals, false);

      expect(result.challengeType).toBe('none');
      expect(result.riskScore).toBe(0);
      expect(result.powDifficulty).toBeNull();
    });

    it('should return challengeType "slider" if time_on_page is very fast', async () => {
      mockThreatIntelService.checkIp.mockResolvedValue({ matched: false });
      mockReputationService.checkIpReputation.mockResolvedValue({ hasRecord: false });
      mockRedisService.incrementRateLimit.mockResolvedValue(1);

      const signals: ClientSignalsDto = {
        webdriver: false,
        canvas_fingerprint: 'abcd123',
        time_on_page_ms: 400, // Fast! (<600ms = +30 score)
        mouse_moves: 100,
        mouse_clicks: 2,
        key_strokes: 15,
      };

      const result = await service.evaluateRisk('1.2.3.4', signals, false);

      expect(result.challengeType).toBe('slider');
      expect(result.riskScore).toBe(30);
    });

    it('should return challengeType "pow" with high difficulty if honeypot is filled and threat intel matches spam', async () => {
      // Spam = +80
      mockThreatIntelService.checkIp.mockResolvedValue({ matched: true, category: 'spam' });
      mockReputationService.checkIpReputation.mockResolvedValue({ hasRecord: false });
      mockRedisService.incrementRateLimit.mockResolvedValue(1);

      const signals: ClientSignalsDto = {
        webdriver: false,
        canvas_fingerprint: 'abcd123',
        time_on_page_ms: 3000,
        mouse_moves: 100,
        mouse_clicks: 2,
        key_strokes: 15,
      };

      // honeypotFilled = true (+80)
      const result = await service.evaluateRisk('2.3.4.5', signals, true);

      // Score = 80 (honeypot) + 80 (spam) = 160 -> capped at 100
      expect(result.challengeType).toBe('pow');
      expect(result.riskScore).toBe(100);
      expect(result.powDifficulty).toBe(18); // Since score >= 90
    });

    it('should add rate limit score if redis increment is high', async () => {
      mockThreatIntelService.checkIp.mockResolvedValue({ matched: false });
      mockReputationService.checkIpReputation.mockResolvedValue({ hasRecord: false });
      mockRedisService.incrementRateLimit.mockResolvedValue(30); // > 25 = +50 score

      const signals: ClientSignalsDto = {
        webdriver: false,
        canvas_fingerprint: 'abcd123',
        time_on_page_ms: 3000,
        mouse_moves: 100,
        mouse_clicks: 2,
        key_strokes: 15,
      };

      const result = await service.evaluateRisk('3.4.5.6', signals, false);

      expect(result.challengeType).toBe('slider'); // Score is 50 -> slider (>= 30)
      expect(result.riskScore).toBe(50);
      expect(result.breakdown.rateLimitScore).toBe(50);
    });
  });
});
