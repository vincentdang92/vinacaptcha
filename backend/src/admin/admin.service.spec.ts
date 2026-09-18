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

  const mockRedisService = {
    getAccountMonthlyUsage: () => Promise.resolve(0),
    invalidateApiKeyCache: () => Promise.resolve(),
    invalidateAllApiKeyCache: () => Promise.resolve(),
    getDashboardStatsCache: () => Promise.resolve(null),
    setDashboardStatsCache: () => Promise.resolve(),
    invalidateDashboardStatsCache: () => Promise.resolve(),
  };

  const mockMailService = {
    getSmtpStatus: () => ({ is_configured: true }),
    saveSmtpConfig: () => Promise.resolve({ success: true }),
    testConnection: () => Promise.resolve({ success: true }),
    sendActivationEmail: () => Promise.resolve({ success: true }),
    sendQuotaWarningEmail: () => Promise.resolve({ success: true }),
  };

  beforeEach(async () => {
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
      mockRepo.findOne = () => Promise.resolve(null);
      await expect(service.login('notfound@domain.com', 'pwd')).rejects.toThrow();
    });

    it('should throw UnauthorizedException if password does not match', async () => {
      mockRepo.findOne = () => Promise.resolve({
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
});
