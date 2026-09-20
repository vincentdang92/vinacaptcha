import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service.js';
import { MailService } from '../mail/mail.service.js';

/**
 * Cron Job đồng bộ định kỳ và cảnh báo Quota người dùng.
 * - Quét các key quota trong Redis.
 * - Tự động gửi email cảnh báo khi tài khoản đạt ngưỡng 80% hoặc 100% quota tháng.
 * - Chạy ngầm định kỳ 15 phút một lần, không ảnh hưởng đến hot path /issue.
 */
@Injectable()
export class QuotaSyncJob {
  private readonly logger = new Logger(QuotaSyncJob.name);

  constructor(
    private readonly redisService: RedisService,
    private readonly dataSource: DataSource,
    private readonly mailService: MailService,
  ) {}

  @Cron('*/5 * * * *', { name: 'quota-sync-and-stats-tracking' })
  async runQuotaSync() {
    this.logger.log('⏳ [Cron 5-min] Bắt đầu đồng bộ Quota & cập nhật Request Tracking trên Redis...');
    try {
      const now = new Date();
      const currentMonth = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const redisClient = this.redisService.getClient();

      // ==========================================================
      // 1. ĐỒNG BỘ QUOTA & CẢNH BÁO EMAIL (80%, 100%)
      // ==========================================================
      const keys = await redisClient.keys(`quota:acc:*:${currentMonth}`);
      if (keys && keys.length > 0) {
        for (const key of keys) {
          const parts = key.split(':');
          if (parts.length < 4) continue;
          const accountId = parts[2];
          const usedRequestsStr = await redisClient.get(key);
          const usedRequests = usedRequestsStr ? parseInt(usedRequestsStr, 10) : 0;

          const accRes = await this.dataSource.query(
            `
            SELECT a.id, a.email, a.name, COALESCE(p.max_requests, 10000) as max_requests, p.name as plan_name
            FROM accounts a
            LEFT JOIN plans p ON p.id = a.plan_id
            WHERE a.id = $1
            `,
            [accountId],
          );

          if (!accRes || accRes.length === 0) continue;
          const account = accRes[0];
          const maxRequests = parseInt(account.max_requests, 10) || 10000;
          const percentage = (usedRequests / maxRequests) * 100;

          // Cảnh báo 100%
          if (percentage >= 100) {
            const warnKey100 = `quota:warned:${accountId}:${currentMonth}:100`;
            const alreadyWarned100 = await redisClient.get(warnKey100);
            if (!alreadyWarned100) {
              await this.sendQuotaWarningEmail(
                account.email,
                account.name,
                account.plan_name || 'Gói Cước',
                usedRequests,
                maxRequests,
                100,
              );
              await redisClient.setex(warnKey100, 35 * 24 * 3600, 'true');
            }
          }
          // Cảnh báo 80%
          else if (percentage >= 80) {
            const warnKey80 = `quota:warned:${accountId}:${currentMonth}:80`;
            const alreadyWarned80 = await redisClient.get(warnKey80);
            if (!alreadyWarned80) {
              await this.sendQuotaWarningEmail(
                account.email,
                account.name,
                account.plan_name || 'Gói Cước',
                usedRequests,
                maxRequests,
                80,
              );
              await redisClient.setex(warnKey80, 35 * 24 * 3600, 'true');
            }
          }
        }
      }

      this.logger.log('✅ [Cron 5-min] Hoàn tất kiểm tra và đồng bộ hạn mức Quota tài khoản.');
    } catch (err) {
      this.logger.error('❌ [Cron] Lỗi khi chạy QuotaSyncJob:', err);
    }
  }

  private async sendQuotaWarningEmail(
    email: string,
    name: string,
    planName: string,
    used: number,
    limit: number,
    threshold: number,
  ) {
    await this.mailService.sendQuotaWarningEmail(email, name, planName, used, limit, threshold);
  }
}
