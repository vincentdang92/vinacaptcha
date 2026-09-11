import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { MailService } from './mail.service.js';

describe('MailService', () => {
  let service: MailService;
  const originalEnv = process.env;

  beforeEach(async () => {
    process.env = { ...originalEnv };
    const module: TestingModule = await Test.createTestingModule({
      providers: [MailService],
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

  it('should return is_configured false when SMTP credentials are not set', () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const status = service.getSmtpStatus();
    expect(status.is_configured).toBe(false);
  });

  it('should return is_configured true and mask user email when credentials are set', () => {
    process.env.SMTP_HOST = 'mail.nhanhoa.com';
    process.env.SMTP_PORT = '465';
    process.env.SMTP_USER = 'admin@nhanhoa.com';
    process.env.SMTP_PASS = 'secret_pass_123';

    const status = service.getSmtpStatus();
    expect(status.is_configured).toBe(true);
    expect(status.host).toBe('mail.nhanhoa.com');
    expect(status.port).toBe(465);
    expect(status.secure).toBe(true);
    expect(status.user).toContain('***');
    expect(status.user).not.toBe('admin@nhanhoa.com');
  });

  it('should fail testConnection gracefully if SMTP is not configured', async () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;

    const result = await service.testConnection('test@example.com');
    expect(result.success).toBe(false);
    expect(result.message).toContain('Chưa cấu hình thông tin đăng nhập SMTP');
  });
});
