import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service.js';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SystemSetting } from './entities/system-setting.entity.js';

describe('MailService', () => {
  let service: MailService;
  const originalEnv = process.env;

  let mockRepo: {
    findOneBy: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    process.env = { ...originalEnv };

    mockRepo = {
      findOneBy: vi.fn().mockResolvedValue(null),
      create: vi.fn((data) => data),
      save: vi.fn((data) => Promise.resolve(data)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: getRepositoryToken(SystemSetting),
          useValue: mockRepo,
        },
      ],
    }).compile();

    service = module.get<MailService>(MailService);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return is_configured false when SMTP credentials are not set in env or DB', () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.SMTP_HOST;

    const status = service.getSmtpStatus();
    expect(status.is_configured).toBe(false);
    expect(status.source).toBe('none');
  });

  it('should return is_configured true with env fallback when credentials are set in env', () => {
    process.env.SMTP_HOST = 'mail.nhanhoa.com';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_USER = 'admin@nhanhoa.com';
    process.env.SMTP_PASS = 'secret_pass_123';

    const status = service.getSmtpStatus();
    expect(status.is_configured).toBe(true);
    expect(status.source).toBe('env');
    expect(status.host).toBe('mail.nhanhoa.com');
    expect(status.port).toBe(465);
    expect(status.secure).toBe(true);
    expect(status.user).toBe('admin@nhanhoa.com');
    expect(status.has_password).toBe(true);
  });

  it('should save SMTP configuration to database and prioritize it over env', async () => {
    process.env.SMTP_HOST = 'smtp.gmail.com';
    process.env.SMTP_USER = 'old@gmail.com';
    process.env.SMTP_PASS = 'oldpass';

    const saveResult = await service.saveSmtpConfig({
      host: 'mail.nhanhoa.com',
      port: 465,
      secure: true,
      user: 'support@nhanhoa.com',
      pass: 'new_db_password',
      from_name: 'NhanHoa Security',
      from_email: 'support@nhanhoa.com',
      ignore_tls: false,
    });

    expect(saveResult.success).toBe(true);
    expect(mockRepo.save).toHaveBeenCalled();

    const status = service.getSmtpStatus();
    expect(status.source).toBe('database');
    expect(status.host).toBe('mail.nhanhoa.com');
    expect(status.port).toBe(465);
    expect(status.user).toBe('support@nhanhoa.com');
    expect(status.from_name).toBe('NhanHoa Security');
  });

  it('should keep existing password when updating without new password', async () => {
    // 1. First save with password
    await service.saveSmtpConfig({
      host: 'mail.nhanhoa.com',
      port: 465,
      secure: true,
      user: 'support@nhanhoa.com',
      pass: 'secure_password_123',
    });

    // 2. Second save with empty password (e.g. user only updated from_name)
    await service.saveSmtpConfig({
      host: 'mail.nhanhoa.com',
      port: 465,
      secure: true,
      user: 'support@nhanhoa.com',
      pass: '',
      from_name: 'Updated Name',
    });

    const status = service.getSmtpStatus();
    expect(status.has_password).toBe(true);
    expect(status.from_name).toBe('Updated Name');
  });

  it('should fail testConnection gracefully if SMTP credentials are missing password', async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const result = await service.testConnection('test@example.com', {
      host: 'mail.nhanhoa.com',
      user: 'admin@nhanhoa.com',
      pass: '',
    });
    expect(result.success).toBe(false);
    expect(result.message).toContain('chưa nhập Mật khẩu');
  });
});
