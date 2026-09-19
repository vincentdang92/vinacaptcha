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

    it('should add rate limit score and mark isRateLimitExceeded if 10m count is high (Low & Slow bot)', async () => {
      mockThreatIntelService.checkIp.mockResolvedValue({ matched: false });
      mockReputationService.checkIpReputation.mockResolvedValue({ hasRecord: false });
      // Giả lập: count10s = 1 (không burst), count10m = 13 (13 lần trong 10 phút), count1h = 13
      mockRedisService.incrementRateLimit
        .mockResolvedValueOnce(1)   // 10s
        .mockResolvedValueOnce(13)  // 10m
        .mockResolvedValueOnce(13); // 1h

      const signals: ClientSignalsDto = {
        webdriver: false,
        canvas_fingerprint: 'abcd123',
        time_on_page_ms: 3000,
        mouse_moves: 100,
        mouse_clicks: 2,
        key_strokes: 15,
      };

      const result = await service.evaluateRisk('116.96.46.193', signals, false);

      // Score = 60 (> 10 reqs/10m) -> challenge 'slider' và isRateLimitExceeded = true
      expect(result.riskScore).toBe(60);
      expect(result.breakdown.rateLimitScore).toBe(60);
      expect(result.breakdown.isRateLimitExceeded).toBe(true);
      expect(result.breakdown.rateLimitCounts?.count10m).toBe(13);
    });

    it('should escalate to challenge when repeated submission has zero fresh physical interaction', async () => {
      mockThreatIntelService.checkIp.mockResolvedValue({ matched: false });
      mockReputationService.checkIpReputation.mockResolvedValue({ hasRecord: false });
      mockRedisService.incrementRateLimit.mockResolvedValue(1);

      // Repeated submission (execution_count = 2) with 0 fresh mouse moves and 0 keystrokes
      const signals: ClientSignalsDto = {
        webdriver: false,
        canvas_fingerprint: 'abcd123',
        time_on_page_ms: 3000,
        mouse_moves: 0,
        mouse_clicks: 0,
        key_strokes: 0,
        execution_count: 2,
      };

      const result = await service.evaluateRisk('1.2.3.4', signals, false);

      // Score: 25 (noMouse && noKeys) + 50 (execution_count > 1 && noMouse && noKeys) = 75 -> 'pow' challenge
      expect(result.challengeType).toBe('pow');
      expect(result.riskScore).toBe(75);
      expect(result.breakdown.clientBehaviorScore).toBe(75);
    });

    it('should penalize rapid consecutive submit in less than 2s', async () => {
      mockThreatIntelService.checkIp.mockResolvedValue({ matched: false });
      mockReputationService.checkIpReputation.mockResolvedValue({ hasRecord: false });
      mockRedisService.incrementRateLimit.mockResolvedValue(1);

      const signals: ClientSignalsDto = {
        webdriver: false,
        canvas_fingerprint: 'abcd123',
        time_on_page_ms: 800, // < 2000ms (+35) and < 1500ms (+15)
        mouse_moves: 5,
        mouse_clicks: 1,
        key_strokes: 2,
        execution_count: 2,
      };

      const result = await service.evaluateRisk('1.2.3.4', signals, false);

      // 15 (time < 1500) + 35 (execution_count > 1 && time < 2000) = 50 -> 'slider' challenge
      expect(result.challengeType).toBe('slider');
      expect(result.riskScore).toBe(50);
    });

    it('should assign max risk score 100 and mark isBannedIp true when IP is banned in reputation service', async () => {
      mockThreatIntelService.checkIp.mockResolvedValue({ matched: false });
      mockReputationService.checkIpReputation.mockResolvedValue({
        hasRecord: true,
        failCount: 15,
        siteCountSeen: 1,
        isBanned: true,
      });
      mockRedisService.incrementRateLimit.mockResolvedValue(1);

      const signals: ClientSignalsDto = {
        webdriver: false,
        canvas_fingerprint: 'abcd123',
        time_on_page_ms: 3000,
        mouse_moves: 100,
        mouse_clicks: 2,
        key_strokes: 15,
      };

      const result = await service.evaluateRisk('1.2.3.4', signals, false);

      expect(result.riskScore).toBe(100);
      expect(result.breakdown.isBannedIp).toBe(true);
      expect(result.breakdown.reputationScore).toBe(100);
    });
  });
});
