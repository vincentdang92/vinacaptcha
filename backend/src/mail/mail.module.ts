import { Module, Global } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailService } from './mail.service.js';
import { SystemSetting } from './entities/system-setting.entity.js';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([SystemSetting])],
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}

