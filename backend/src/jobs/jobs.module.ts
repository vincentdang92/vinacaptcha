import { Module } from '@nestjs/common';
import { ThreatIntelSyncJob } from './threat-intel-sync.job.js';
import { ThreatIntelModule } from '../threat-intel/threat-intel.module.js';
import { ReputationDecayJob } from './reputation-decay.job.js';
import { ReputationModule } from '../reputation/reputation.module.js';
import { QuotaSyncJob } from './quota-sync.job.js';

/**
 * Module chứa tất cả Cron Jobs của hệ thống.
 * Import các module cần thiết để inject service vào job.
 */
@Module({
  imports: [ThreatIntelModule, ReputationModule],
  providers: [ThreatIntelSyncJob, ReputationDecayJob, QuotaSyncJob],
})
export class JobsModule {}
