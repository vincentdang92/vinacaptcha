import { Module } from '@nestjs/common';
import { VerifyController } from './verify.controller.js';
import { VerifyService } from './verify.service.js';
import { ReputationModule } from '../reputation/reputation.module.js';

@Module({
  imports: [ReputationModule],
  controllers: [VerifyController],
  providers: [VerifyService],
  exports: [VerifyService],
})
export class VerifyModule {}

