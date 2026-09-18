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
});
