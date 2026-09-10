import { Module } from '@nestjs/common';
import { IssueController } from './issue.controller.js';
import { IssueService } from './issue.service.js';
import { RiskEngineModule } from '../risk-engine/risk-engine.module.js';

@Module({
  imports: [RiskEngineModule],
  controllers: [IssueController],
  providers: [IssueService],
})
export class IssueModule {}
