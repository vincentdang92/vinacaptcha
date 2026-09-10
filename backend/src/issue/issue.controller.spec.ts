import { Test, TestingModule } from '@nestjs/testing';
import { IssueController } from './issue.controller.js';
import { IssueService } from './issue.service.js';

describe('IssueController', () => {
  let controller: IssueController;

  const mockIssueService = {
    issueToken: () => Promise.resolve({ session_id: 'test' }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [IssueController],
      providers: [
        {
          provide: IssueService,
          useValue: mockIssueService,
        },
      ],
    }).compile();

    controller = module.get<IssueController>(IssueController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
