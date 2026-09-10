import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { IssueModule } from './issue/issue.module.js';
import { VerifyModule } from './verify/verify.module.js';
import { RedisModule } from './redis/redis.module.js';
import { AdminModule } from './admin/admin.module.js';
import { ThreatIntelModule } from './threat-intel/threat-intel.module.js';
import { ReputationModule } from './reputation/reputation.module.js';
import { RiskEngineModule } from './risk-engine/risk-engine.module.js';
import { JobsModule } from './jobs/jobs.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(), // Kích hoạt @Cron() decorator cho toàn bộ app
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST'),
        port: configService.get<number>('DB_PORT'),
        username: configService.get<string>('DB_USER'),
        password: configService.get<string>('DB_PASSWORD'),
        database: configService.get<string>('DB_NAME'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    ThreatIntelModule,
    ReputationModule,
    RiskEngineModule,
    IssueModule,
    VerifyModule,
    RedisModule,
    AdminModule,
    JobsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
