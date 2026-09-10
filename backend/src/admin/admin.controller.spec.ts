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
});
