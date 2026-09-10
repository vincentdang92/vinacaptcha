import { Module } from '@nestjs/common';
import { RiskEngineService } from './risk-engine.service.js';
import { ThreatIntelModule } from '../threat-intel/threat-intel.module.js';
import { ReputationModule } from '../reputation/reputation.module.js';
import { RedisModule } from '../redis/redis.module.js';

@Module({
  imports: [ThreatIntelModule, ReputationModule, RedisModule],
  providers: [RiskEngineService],
  exports: [RiskEngineService],
})
export class RiskEngineModule {}
