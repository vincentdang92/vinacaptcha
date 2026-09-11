import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { RedisService } from '../redis/redis.service.js';
import * as nodemailer from 'nodemailer';

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

      // ==========================================================
      // 2. TÍNH TOÁN & CẬP NHẬT STATS CACHE TRÊN REDIS (5 PHÚT / LẦN)
      // ==========================================================
      const totalSitesRes = await this.dataSource.query('SELECT COUNT(*) as count FROM sites');
      const activeSitesRes = await this.dataSource.query(`SELECT COUNT(*) as count FROM sites WHERE status = 'active'`);
      const totalRequestsRes = await this.dataSource.query('SELECT COUNT(*) as count FROM verification_logs');
      const threatIntelRes = await this.dataSource.query('SELECT COUNT(*) as count FROM threat_intel_ranges');
      const bannedIpsRes = await this.dataSource.query('SELECT COUNT(*) as count FROM ip_reputation WHERE fail_count > 10');

      const recentLogs = await this.dataSource.query(`
        SELECT 
          vl.ip,
          vl.challenge_type,
          vl.result,
          vl.risk_score,
          vl.risk_breakdown,
          vl.created_at,
          s.primary_domain AS site_domain
        FROM verification_logs vl
        LEFT JOIN sites s ON s.id = vl.site_id
        ORDER BY vl.created_at DESC 
        LIMIT 10
      `);

      const chartData = await this.dataSource.query(`
        SELECT DATE(created_at) as date, 
               SUM(CASE WHEN result = 'pass' THEN 1 ELSE 0 END) as passed,
               SUM(CASE WHEN result = 'fail' THEN 1 ELSE 0 END) as failed
        FROM verification_logs 
        GROUP BY DATE(created_at)
        ORDER BY date ASC
        LIMIT 7
      `);

      const formattedChartData = chartData.map((item: any) => ({
        date: item.date,
        passed: parseInt(item.passed, 10) || 0,
        failed: parseInt(item.failed, 10) || 0,
      }));

      const statsData = {
        totalSites: parseInt(totalSitesRes[0].count, 10),
        activeSites: parseInt(activeSitesRes[0].count, 10),
        totalRequests: parseInt(totalRequestsRes[0].count, 10),
        knowledgeBaseIps: parseInt(threatIntelRes[0].count, 10),
        bannedIps: parseInt(bannedIpsRes[0].count, 10),
        recentLogs,
        chartData: formattedChartData,
        last_synced_at: new Date().toISOString(),
      };

      await this.redisService.setDashboardStatsCache(statsData, 300); // 5 phút TTL
      this.logger.log('✅ [Cron 5-min] Hoàn tất cập nhật Request Tracking & Dashboard Cache trên Redis.');
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
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
      this.logger.warn(`[QuotaAlert] Bỏ qua gửi mail cho ${email} vì chưa cấu hình SMTP.`);
      return;
    }

    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS,
        },
      });

      const subject =
        threshold >= 100
          ? `[NhanHoaCaptcha] CẢNH BÁO: Bạn đã sử dụng hết 100% hạn mức Captcha tháng này!`
          : `[NhanHoaCaptcha] Cảnh báo: Bạn đã sử dụng 80% hạn mức Captcha tháng này`;

      const alertColor = threshold >= 100 ? '#ea5455' : '#ff9f43';

      const html = `
        <div style="font-family: sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; padding: 24px;">
          <h2 style="color: ${alertColor}; margin-top: 0;">Thông Báo Dung Lượng Captcha</h2>
          <p>Xin chào <strong>${name}</strong>,</p>
          <p>Hệ thống NhanHoaCaptcha xin thông báo tài khoản của bạn đã đạt mốc <strong>${threshold}%</strong> hạn mức sử dụng trong tháng:</p>
          
          <div style="background-color: #f8f9fa; border-left: 4px solid ${alertColor}; padding: 16px; margin: 20px 0; border-radius: 4px;">
            <p style="margin: 4px 0;"><strong>Gói cước:</strong> ${planName}</p>
            <p style="margin: 4px 0;"><strong>Đã sử dụng:</strong> ${used.toLocaleString()} / ${limit.toLocaleString()} requests</p>
            <p style="margin: 4px 0;"><strong>Tỷ lệ tiêu thụ:</strong> ${Math.round((used / limit) * 100)}%</p>
          </div>

          ${
            threshold >= 100
              ? `<p style="color: #ea5455; font-weight: bold;">⚠️ Các request phát hành Captcha tiếp theo trên các website của bạn sẽ bị tạm dừng cho đến khi bạn nâng cấp gói cước mới hoặc bước sang chu kỳ tháng sau.</p>`
              : `<p>Để đảm bảo hoạt động xác thực của website không bị gián đoạn, bạn có thể cân nhắc liên hệ Quản trị viên để nâng cấp gói cước cao hơn.</p>`
          }

          <p style="margin-top: 24px; color: #666; font-size: 13px;">Trân trọng,<br/>Đội ngũ Kỹ thuật NhanHoaCaptcha</p>
        </div>
      `;

      await transporter.sendMail({
        from: `"NhanHoaCaptcha Alert" <${process.env.SMTP_USER}>`,
        to: email,
        subject,
        html,
      });

      this.logger.log(`📧 [QuotaAlert] Đã gửi email cảnh báo (${threshold}%) thành công tới: ${email}`);
    } catch (err) {
      this.logger.error(`❌ [QuotaAlert] Lỗi khi gửi email cảnh báo tới ${email}:`, err);
    }
  }
}
