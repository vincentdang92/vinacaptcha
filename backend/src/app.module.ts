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
import { MailModule } from './mail/mail.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ScheduleModule.forRoot(), // Kích hoạt @Cron() decorator cho toàn bộ app
    MailModule,
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST') || configService.get<string>('BACKEND_DATABASE_HOST') || 'postgres',
        port: parseInt(configService.get<string>('DB_PORT') || configService.get<string>('BACKEND_DATABASE_PORT') || '5432', 10),
        username: configService.get<string>('DB_USER') || configService.get<string>('BACKEND_DATABASE_USER') || 'captcha_user',
        password: configService.get<string>('DB_PASSWORD') || configService.get<string>('BACKEND_DATABASE_PASS') || 'captcha_password',
        database: configService.get<string>('DB_NAME') || configService.get<string>('BACKEND_DATABASE_NAME') || 'captcha_db',
        autoLoadEntities: true,
        synchronize: false,
        extra: {
          max: 30,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        },
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
