import { Test, TestingModule } from '@nestjs/testing';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { ThreatIntelService } from '../threat-intel/threat-intel.service.js';

describe('AdminController', () => {
  let controller: AdminController;

  const mockAdminService = {
    getDashboardStats: () => Promise.resolve({}),
    getSites: () => Promise.resolve([]),
    getSetupStatus: () => Promise.resolve({ is_setup: true, has_admin: true }),
    runSetup: () => Promise.resolve({ success: true }),
  };

  const mockThreatIntelService = {
    getSourceConfigs: () => Promise.resolve([]),
    getThreatIntelStats: () => Promise.resolve({}),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminController],
      providers: [
        {
          provide: AdminService,
          useValue: mockAdminService,
        },
        {
          provide: ThreatIntelService,
          useValue: mockThreatIntelService,
        },
      ],
    }).compile();

    controller = module.get<AdminController>(AdminController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('legacyActivateLink (GET auth/activate)', () => {
    const originalEnv = process.env;
    let redirectedTo: string | undefined;
    const res = { redirect: (url: string) => { redirectedTo = url; } };

    beforeEach(() => {
      process.env = { ...originalEnv };
      delete process.env.APP_URL;
      delete process.env.DASHBOARD_URL;
      redirectedTo = undefined;
    });

    afterEach(() => {
      process.env = originalEnv;
    });

    it('redirects old email links to the dashboard /activate page on the same origin', async () => {
      await controller.legacyActivateLink('abc123', res);
      expect(redirectedTo).toBe('/activate?token=abc123');
    });

    it('uses the configured public URL and encodes the token', async () => {
      process.env.APP_URL = 'https://captcha.example.com/';
      await controller.legacyActivateLink('a&b', res);
      expect(redirectedTo).toBe('https://captcha.example.com/activate?token=a%26b');
    });

    it('still lands on the activate page when the token is missing', async () => {
      await controller.legacyActivateLink(undefined as any, res);
      expect(redirectedTo).toBe('/activate');
    });
  });
});
