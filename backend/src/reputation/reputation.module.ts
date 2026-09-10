import { Module } from '@nestjs/common';
import { ReputationService } from './reputation.service.js';

@Module({
  providers: [ReputationService],
  exports: [ReputationService],
})
export class ReputationModule {}
