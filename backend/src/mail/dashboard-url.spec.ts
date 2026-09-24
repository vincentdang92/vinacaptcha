import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getConfiguredDashboardUrl, resolveDashboardBaseUrl } from './dashboard-url.js';

describe('dashboard-url', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.APP_URL;
    delete process.env.DASHBOARD_URL;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('getConfiguredDashboardUrl', () => {
    it('prefers DASHBOARD_URL over APP_URL and trims trailing slashes', () => {
      process.env.APP_URL = 'https://app.example.com';
      process.env.DASHBOARD_URL = 'https://dash.example.com/';
      expect(getConfiguredDashboardUrl()).toBe('https://dash.example.com');
    });

    it('ignores localhost values (dev APP_URL usually points at the backend)', () => {
      process.env.APP_URL = 'http://localhost:3068';
      expect(getConfiguredDashboardUrl()).toBeUndefined();
    });

    it('ignores values that are not http(s) URLs', () => {
      process.env.APP_URL = 'captcha.example.com';
      expect(getConfiguredDashboardUrl()).toBeUndefined();
    });
  });

  describe('resolveDashboardBaseUrl', () => {
    it('always uses the configured public URL, ignoring spoofed request headers', () => {
      process.env.APP_URL = 'https://captcha.example.com';
      const url = resolveDashboardBaseUrl({
        host: 'evil.com',
        origin: 'https://evil.com',
        'x-forwarded-host': 'evil.com',
      });
      expect(url).toBe('https://captcha.example.com');
    });

    it('dev: uses the dashboard origin (port 3069), not the backend host (port 3068)', () => {
      process.env.APP_URL = 'http://localhost:3068';
      const url = resolveDashboardBaseUrl({ host: 'localhost:3068', origin: 'http://localhost:3069' });
      expect(url).toBe('http://localhost:3069');
    });

    it('dev behind the Vite proxy (changeOrigin) still resolves to the dashboard origin', () => {
      const url = resolveDashboardBaseUrl({ host: '127.0.0.1:3068', origin: 'http://localhost:3069' });
      expect(url).toBe('http://localhost:3069');
    });

    it('gateway on a custom port: keeps the port from Origin even though nginx $host drops it', () => {
      const url = resolveDashboardBaseUrl({
        host: '203.0.113.10',
        origin: 'http://203.0.113.10:8080',
        'x-forwarded-proto': 'http',
      });
      expect(url).toBe('http://203.0.113.10:8080');
    });

    it('ignores an Origin whose hostname differs from Host', () => {
      const url = resolveDashboardBaseUrl({
        host: 'captcha.example.com',
        origin: 'https://evil.com',
        'x-forwarded-proto': 'https',
      });
      expect(url).toBe('https://captcha.example.com');
    });

    it('never trusts X-Forwarded-Host', () => {
      const url = resolveDashboardBaseUrl({
        host: 'captcha.example.com',
        'x-forwarded-host': 'evil.com',
        'x-forwarded-proto': 'https, http',
      });
      expect(url).toBe('https://captcha.example.com');
    });

    it('does not accept a loopback Origin when the request came in on a public host', () => {
      const url = resolveDashboardBaseUrl({
        host: 'captcha.example.com',
        origin: 'http://localhost:8080',
        'x-forwarded-proto': 'https',
      });
      expect(url).toBe('https://captcha.example.com');
    });

    it('falls back to DASHBOARD_URL (even localhost) and then the default dev dashboard', () => {
      expect(resolveDashboardBaseUrl()).toBe('http://localhost:3069');
      process.env.DASHBOARD_URL = 'http://localhost:5173/';
      expect(resolveDashboardBaseUrl({ host: 'localhost:3068' })).toBe('http://localhost:5173');
    });
  });
});
