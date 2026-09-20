import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AdminService } from './admin.service.js';
import { Site } from './entities/site.entity.js';
import { ApiKey } from './entities/api-key.entity.js';
import { Account } from './entities/account.entity.js';
import { Plan } from './entities/plan.entity.js';
import { RedisService } from '../redis/redis.service.js';
import { MailService } from '../mail/mail.service.js';

describe('AdminService', () => {
  let service: AdminService;

  const mockRepo = {
    find: () => Promise.resolve([]),
    findOne: () => Promise.resolve(null),
    create: (data: any) => data,
    save: (data: any) => Promise.resolve(data),
    count: () => Promise.resolve(0),
  };

  const mockDataSource = {
    query: () => Promise.resolve([]),
  };

  const mockTokens = new Map<string, string>();

  const mockRedisService = {
    getAccountMonthlyUsage: () => Promise.resolve(0),
    invalidateApiKeyCache: () => Promise.resolve(),
    invalidateAllApiKeyCache: () => Promise.resolve(),
    getDashboardStatsCache: () => Promise.resolve(null),
    setDashboardStatsCache: () => Promise.resolve(),
    invalidateDashboardStatsCache: () => Promise.resolve(),
    setOneTimeToken: (key: string, ttl: number, val: string) => {
      mockTokens.set(key, val);
      return Promise.resolve();
    },
    useOneTimeToken: (key: string) => {
      const val = mockTokens.get(key) || null;
      mockTokens.delete(key);
      return Promise.resolve(val);
    },
    getClient: () => ({
      get: (_k: string) => Promise.resolve(null),
      setex: (_k: string, _t: number, _v: string) => Promise.resolve('OK'),
    }),
  };

  const mockMailService = {
    getSmtpStatus: () => ({ is_configured: true }),
    saveSmtpConfig: () => Promise.resolve({ success: true }),
    testConnection: () => Promise.resolve({ success: true }),
    sendActivationEmail: () => Promise.resolve({ success: true }),
    sendQuotaWarningEmail: () => Promise.resolve({ success: true }),
    sendPasswordResetEmail: () => Promise.resolve({ success: true }),
  };

  beforeEach(async () => {
    mockTokens.clear();
    process.env.AUTH_CAPTCHA_DISABLED = 'true';
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(Site), useValue: mockRepo },
        { provide: getRepositoryToken(ApiKey), useValue: mockRepo },
        { provide: getRepositoryToken(Account), useValue: mockRepo },
        { provide: getRepositoryToken(Plan), useValue: mockRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: RedisService, useValue: mockRedisService },
        { provide: MailService, useValue: mockMailService },
      ],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('login', () => {
    it('should throw UnauthorizedException if account is not found', async () => {
      mockRepo.findOneBy = () => Promise.resolve(null);
      await expect(service.login('notfound@domain.com', 'pwd')).rejects.toThrow();
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      mockRepo.findOneBy = () => Promise.resolve({
        email: 'user@domain.com',
        password_hash: 'different_hash',
        status: 'active',
        is_verified: true,
      });
      await expect(service.login('user@domain.com', 'wrong_password')).rejects.toThrow();
    });

    it('should successfully login and return tokens when password matches', async () => {
      // Use the actual hash logic
      const salt = process.env.APP_SALT || process.env.JWT_SECRET || 'vina_captcha_salt_2026';
      const crypto = await import('crypto');
      const correctHash = crypto.createHash('sha256').update('CorrectPassword123!' + salt).digest('hex');

      mockRepo.findOneBy = () => Promise.resolve({
        id: 'acc-123',
        email: 'user@domain.com',
        password_hash: correctHash,
        status: 'active',
        is_verified: true,
        role: 'user',
        name: 'Test User',
      });

      const result = await service.login('user@domain.com', 'CorrectPassword123!');
      expect(result).toHaveProperty('access_token');
      expect(result.account.email).toBe('user@domain.com');
    });
  });

  describe('forgotPassword', () => {
    it('should return generic success message even if account is not found', async () => {
      mockRepo.findOneBy = () => Promise.resolve(null);
      const res = await service.forgotPassword('nonexistent@domain.com');
      expect(res.success).toBe(true);
      expect(mockTokens.size).toBe(0);
    });

    it('should store reset token in Redis and send email if account exists', async () => {
      mockRepo.findOneBy = () => Promise.resolve({
        id: 'acc-456',
        email: 'valid@domain.com',
        name: 'Valid User',
        status: 'active',
      });

      const res = await service.forgotPassword('valid@domain.com');
      expect(res.success).toBe(true);
      expect(mockTokens.size).toBe(1);
    });
  });

  describe('resetPassword', () => {
    it('should throw BadRequestException if token is missing or expired', async () => {
      await expect(service.resetPassword('invalid_token', 'NewPassword123!')).rejects.toThrow();
    });

    it('should throw BadRequestException if password is under 6 characters', async () => {
      await expect(service.resetPassword('valid_token', '123')).rejects.toThrow();
    });

    it('should successfully update password with one-time token and allow subsequent login', async () => {
      const existingAccount = {
        id: 'acc-789',
        email: 'resetuser@domain.com',
        password_hash: 'initial_hash',
        status: 'active',
        is_verified: true,
        role: 'user',
        name: 'Reset User',
      };

      mockTokens.set('pwd_reset:secret_token_123', 'acc-789');
      mockRepo.findOneBy = (criteria: any) => {
        if (criteria?.id === 'acc-789' || criteria?.email === 'resetuser@domain.com') {
          return Promise.resolve(existingAccount);
        }
        return Promise.resolve(null);
      };
      mockRepo.save = (acc: any) => Promise.resolve(acc);

      const res = await service.resetPassword('secret_token_123', 'NewBrandPassword789!');
      expect(res.success).toBe(true);
      // Verify one-time token was removed
      expect(mockTokens.has('pwd_reset:secret_token_123')).toBe(false);

      // Now verify login works with the new password
      const loginRes = await service.login('resetuser@domain.com', 'NewBrandPassword789!');
      expect(loginRes).toHaveProperty('access_token');
    });
  });

  describe('updateAccount', () => {
    it('should update password with matching hash so login can succeed', async () => {
      const existingAccount = {
        id: 'acc-123',
        email: 'admin@domain.com',
        password_hash: 'old_hash',
        status: 'active',
        is_verified: true,
        role: 'admin',
        name: 'Admin User',
      };

      mockRepo.findOne = () => Promise.resolve(existingAccount);
      mockRepo.save = (acc: any) => Promise.resolve(acc);

      const updated = await service.updateAccount('acc-123', { password: 'NewSecurePassword456!' });

      mockRepo.findOneBy = () => Promise.resolve(updated);
      const loginRes = await service.login('admin@domain.com', 'NewSecurePassword456!');
      expect(loginRes).toHaveProperty('access_token');
    });
  });

  describe('getVerificationLogs', () => {
    it('should query verification logs with pagination and compute ipSummary', async () => {
      mockDataSource.query = (q: string) => {
        if (q.includes('SELECT \n        vl.id')) {
          return Promise.resolve([
            {
              id: '1',
              ip: '113.190.234.12',
              challenge_type: 'slider',
              result: 'pass',
              risk_score: '10.0',
              created_at: new Date().toISOString(),
              site_domain: 'example.com',
            },
          ]);
        }
        if (q.includes('SELECT \n        COUNT(*) as total')) {
          return Promise.resolve([
            {
              total: '1',
              pass_count: '1',
              fail_count: '0',
              avg_risk_score: '10.0',
              first_seen: new Date().toISOString(),
              last_seen: new Date().toISOString(),
            },
          ]);
        }
        return Promise.resolve([]);
      };

      const res = await service.getVerificationLogs({ ip: '113.190.234.12', page: 1, limit: 20 });
      expect(res.data.length).toBe(1);
      expect(res.total).toBe(1);
      expect(res.ipSummary).not.toBeNull();
      expect(res.ipSummary?.ip).toBe('113.190.234.12');
      expect(res.ipSummary?.passCount).toBe(1);
    });
  });

  describe('getIpIntelligence', () => {
    it('should return local network classification for localhost IP', async () => {
      const intel = await service.getIpIntelligence('127.0.0.1');
      expect(intel.ip).toBe('127.0.0.1');
      expect(intel.is_private).toBe(true);
      expect(intel.geo.city).toBe('Localhost');
    });

    it('should return intelligence structure for public IP', async () => {
      mockDataSource.query = (q: string) => {
        if (q.includes('threat_intel_ranges')) {
          return Promise.resolve([]);
        }
        if (q.includes('ip_reputation')) {
          return Promise.resolve([
            {
              fail_count: 2,
              site_count_seen: 1,
              first_seen_at: new Date().toISOString(),
              last_seen_at: new Date().toISOString(),
            },
          ]);
        }
        if (q.includes('verification_logs')) {
          return Promise.resolve([
            {
              total: '5',
              pass_count: '4',
              fail_count: '1',
              avg_risk_score: '18.0',
              first_seen: new Date().toISOString(),
              last_seen: new Date().toISOString(),
              sites: ['demo.vn'],
            },
          ]);
        }
        return Promise.resolve([]);
      };

      const intel = await service.getIpIntelligence('113.190.234.12');
      expect(intel.ip).toBe('113.190.234.12');
      expect(intel.is_private).toBe(false);
      expect(intel.reputation.fail_count).toBe(2);
      expect(intel.verification_stats.total_requests).toBe(5);
    });
  });

  describe('getDashboardStats', () => {
    it('should return cached stats if present for admin', async () => {
      const cached = {
        totalSites: 5,
        activeSites: 4,
        totalRequests: 100,
        knowledgeBaseIps: 10,
        bannedIps: 2,
        recentLogs: [],
        chartData: [{ date: '2026-09-20', passed: 90, failed: 10 }],
        marketingStats: {
          utmCampaigns: [],
          deviceBreakdown: { mobile: 2, desktop: 3, touchScreenPct: 40 },
          userEngagement: { avgTimeOnPageMs: 1500, avgScrollDepthPct: 80, pasteDetectedCount: 0 },
        },
        last_synced_at: '2026-09-20T10:00:00.000Z',
      };
      mockRedisService.getDashboardStatsCache = () => Promise.resolve(cached as any);

      const stats = await service.getDashboardStats();
      expect(stats).toEqual(cached);
    });

    it('should query DB and calculate continuous 7-day stats and marketing metrics when cache is miss', async () => {
      mockRedisService.getDashboardStatsCache = () => Promise.resolve(null);
      let setCacheCalled = false;
      mockRedisService.setDashboardStatsCache = () => {
        setCacheCalled = true;
        return Promise.resolve();
      };

      mockDataSource.query = (q: string) => {
        if (q.includes('COUNT(*) as count FROM sites WHERE status = \'active\'')) {
          return Promise.resolve([{ count: '3' }]);
        }
        if (q.includes('COUNT(*) as count FROM sites')) {
          return Promise.resolve([{ count: '5' }]);
        }
        if (q.includes('COUNT(*) as count FROM verification_logs')) {
          return Promise.resolve([{ count: '150' }]);
        }
        if (q.includes('COUNT(*) as count FROM threat_intel_ranges')) {
          return Promise.resolve([{ count: '20' }]);
        }
        if (q.includes('COUNT(*) as count FROM ip_reputation')) {
          return Promise.resolve([{ count: '1' }]);
        }
        if (q.includes('day_series')) {
          return Promise.resolve([
            { date: '2026-09-14', passed: 10, failed: 2 },
            { date: '2026-09-15', passed: 12, failed: 1 },
            { date: '2026-09-16', passed: 15, failed: 0 },
            { date: '2026-09-17', passed: 20, failed: 3 },
            { date: '2026-09-18', passed: 18, failed: 2 },
            { date: '2026-09-19', passed: 25, failed: 1 },
            { date: '2026-09-20', passed: 30, failed: 4 },
          ]);
        }
        if (q.includes('utm_campaign')) {
          return Promise.resolve([
            { campaign: 'summer_promo', source: 'facebook', total: '25', pass_count: '24', fail_count: '1' },
          ]);
        }
        if (q.includes('total_samples')) {
          return Promise.resolve([
            {
              total_samples: '50',
              touch_count: '30',
              mobile_count: '25',
              avg_time: '2400',
              avg_scroll: '65',
              paste_count: '5',
            },
          ]);
        }
        return Promise.resolve([]);
      };

      const stats = await service.getDashboardStats();
      expect(stats.totalSites).toBe(5);
      expect(stats.activeSites).toBe(3);
      expect(stats.totalRequests).toBe(150);
      expect(stats.chartData.length).toBe(7);
      expect(stats.chartData[6].date).toBe('2026-09-20');
      expect(stats.chartData[6].passed).toBe(30);
      expect(stats.marketingStats?.utmCampaigns[0].campaign).toBe('summer_promo');
      expect(stats.marketingStats?.deviceBreakdown.mobile).toBe(25);
      expect(stats.marketingStats?.deviceBreakdown.desktop).toBe(25);
      expect(stats.marketingStats?.deviceBreakdown.touchScreenPct).toBe(60);
      expect(setCacheCalled).toBe(true);
    });
  });
});
