import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Account } from './entities/account.entity.js';
import { Site } from './entities/site.entity.js';
import { ApiKey } from './entities/api-key.entity.js';
import { Plan } from './entities/plan.entity.js';
import { ThreatIntelModule } from '../threat-intel/threat-intel.module.js';
import { VerifyModule } from '../verify/verify.module.js';

@Module({
  imports: [
    TypeOrmModule.forFeature([Account, Site, ApiKey, Plan]),
    ThreatIntelModule,
    VerifyModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}

