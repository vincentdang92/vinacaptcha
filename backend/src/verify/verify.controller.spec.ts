import { Test, TestingModule } from '@nestjs/testing';
import { VerifyController } from './verify.controller.js';
import { VerifyService } from './verify.service.js';

describe('VerifyController', () => {
  let controller: VerifyController;

  const mockVerifyService = {
    verifyCaptcha: () => Promise.resolve({ success: true }),
    siteVerify: () => Promise.resolve({ success: true }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [VerifyController],
      providers: [
        {
          provide: VerifyService,
          useValue: mockVerifyService,
        },
      ],
    }).compile();

    controller = module.get<VerifyController>(VerifyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
