import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AdminService } from './admin.service.js';
import { Site } from './entities/site.entity.js';
import { ApiKey } from './entities/api-key.entity.js';
import { Account } from './entities/account.entity.js';
import { Plan } from './entities/plan.entity.js';
import { RedisService } from '../redis/redis.service.js';

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(Site), useValue: mockRepo },
        { provide: getRepositoryToken(ApiKey), useValue: mockRepo },
        { provide: getRepositoryToken(Account), useValue: mockRepo },
        { provide: getRepositoryToken(Plan), useValue: mockRepo },
        { provide: DataSource, useValue: mockDataSource },
        { provide: RedisService, useValue: mockRedisService },
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
  });
});
