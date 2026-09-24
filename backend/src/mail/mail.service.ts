import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { SystemSetting } from './entities/system-setting.entity.js';
import { resolveDashboardBaseUrl } from './dashboard-url.js';

// Tên hiển thị do người dùng tự nhập lúc đăng ký — phải escape trước khi chèn vào HTML email,
// nếu không kẻ xấu có thể đăng ký bằng email nạn nhân kèm tên chứa link/HTML lừa đảo.
function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from_name: string;
  from_email: string;
  ignore_tls: boolean;
}

export interface SmtpStatus {
  is_configured: boolean;
  source: 'database' | 'env' | 'none';
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from_name: string;
  from_email: string;
  ignore_tls: boolean;
  has_password: boolean;
}

export interface SendMailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class MailService implements OnModuleInit {
  private readonly logger = new Logger(MailService.name);
  private cachedDbConfig: SmtpConfig | null = null;

  constructor(
    @Optional()
    @InjectRepository(SystemSetting)
    private readonly settingsRepo?: Repository<SystemSetting>,
    @Optional()
    private readonly dataSource?: DataSource,
  ) {}

  async onModuleInit() {
    await this.ensureSettingsTable();
    await this.loadConfigFromDb();
  }

  /**
   * Đảm bảo bảng system_settings luôn tồn tại trong cơ sở dữ liệu
   */
  private async ensureSettingsTable() {
    if (!this.dataSource) return;
    try {
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value JSONB NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
    } catch (err: any) {
      this.logger.warn(`Không thể tự động tạo bảng system_settings: ${err.message}`);
    }
  }

  /**
   * Nạp cấu hình SMTP từ database vào bộ nhớ
   */
  async loadConfigFromDb(): Promise<SmtpConfig | null> {
    if (!this.settingsRepo && !this.dataSource) return null;
    try {
      if (this.settingsRepo) {
        const setting = await this.settingsRepo.findOneBy({ key: 'smtp' });
        if (setting?.value && typeof setting.value === 'object') {
          this.cachedDbConfig = setting.value as SmtpConfig;
          return this.cachedDbConfig;
        }
      } else if (this.dataSource) {
        const rows = await this.dataSource.query(`SELECT value FROM system_settings WHERE key = 'smtp' LIMIT 1`);
        if (rows && rows[0]?.value) {
          this.cachedDbConfig = rows[0].value as SmtpConfig;
          return this.cachedDbConfig;
        }
      }
      this.cachedDbConfig = null;
      return null;
    } catch (err: any) {
      this.logger.warn(`Lỗi khi đọc cấu hình SMTP từ DB: ${err.message}`);
      this.cachedDbConfig = null;
      return null;
    }
  }

  /**
   * Lấy cấu hình SMTP hiệu lực (Ưu tiên DB -> Fallback sang .env)
   */
  private getEffectiveConfig(customConfig?: Partial<SmtpConfig>): SmtpConfig {
    const db = this.cachedDbConfig;

    // 1. Host
    const host = customConfig?.host || db?.host || process.env.SMTP_HOST || 'smtp.gmail.com';

    // 2. Port
    const port = customConfig?.port ?? db?.port ?? (parseInt(process.env.SMTP_PORT || '587', 10) || 587);

    // 3. User
    const user = customConfig?.user !== undefined ? customConfig.user : (db?.user ?? process.env.SMTP_USER ?? '');

    // 4. Pass
    let pass = customConfig?.pass !== undefined ? customConfig.pass : (db?.pass ?? process.env.SMTP_PASS ?? '');
    // Nếu customConfig truyền pass rỗng nhưng trước đó đã có pass trong DB -> giữ nguyên pass cũ
    if (customConfig && customConfig.pass === '' && db?.pass) {
      pass = db.pass;
    }

    // 5. Secure
    let secure = customConfig?.secure;
    if (secure === undefined) {
      if (db?.secure !== undefined) {
        secure = db.secure;
      } else {
        secure = process.env.SMTP_SECURE === 'true' || port === 465;
      }
    }

    // 6. From Name
    const fromName = customConfig?.from_name || db?.from_name || process.env.SMTP_FROM_NAME || 'NhanHoaCaptcha System';

    // 7. From Email
    const fromEmail = customConfig?.from_email || db?.from_email || process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || user || 'no-reply@nhanhoa.com';

    // 8. Ignore TLS
    let ignoreTls = customConfig?.ignore_tls;
    if (ignoreTls === undefined) {
      if (db?.ignore_tls !== undefined) {
        ignoreTls = db.ignore_tls;
      } else {
        ignoreTls = process.env.SMTP_IGNORE_TLS === 'true' || process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'false';
      }
    }

    return {
      host,
      port,
      secure: Boolean(secure),
      user,
      pass,
      from_name: fromName,
      from_email: fromEmail,
      ignore_tls: Boolean(ignoreTls),
    };
  }

  /**
   * Khởi tạo Transporter Nodemailer
   */
  private createTransporter(customConfig?: Partial<SmtpConfig>) {
    const config = this.getEffectiveConfig(customConfig);

    const transportOptions: nodemailer.TransportOptions = {
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: config.user && config.pass ? { user: config.user, pass: config.pass } : undefined,
      tls: config.ignore_tls ? { rejectUnauthorized: false } : undefined,
    } as any;

    return nodemailer.createTransport(transportOptions);
  }

  /**
   * Lấy thông tin cấu hình SMTP hiện tại (để hiển thị và chỉnh sửa trên Dashboard)
   */
  getSmtpStatus(): SmtpStatus {
    const config = this.getEffectiveConfig();
    let source: 'database' | 'env' | 'none' = 'none';
    let isConfigured = false;

    if (this.cachedDbConfig) {
      source = 'database';
      isConfigured = Boolean(
        this.cachedDbConfig.host && (this.cachedDbConfig.user ? Boolean(this.cachedDbConfig.pass) : true),
      );
    } else if (process.env.SMTP_USER && process.env.SMTP_PASS) {
      source = 'env';
      isConfigured = true;
    } else if (process.env.SMTP_HOST && (process.env.SMTP_USER ? Boolean(process.env.SMTP_PASS) : false)) {
      source = 'env';
      isConfigured = true;
    }

    const hasPassword = Boolean(config.pass);

    return {
      is_configured: isConfigured,
      source,
      host: config.host,
      port: config.port,
      secure: config.secure,
      user: config.user,
      from_name: config.from_name,
      from_email: config.from_email,
      ignore_tls: config.ignore_tls,
      has_password: hasPassword,
    };
  }

  /**
   * Lưu hoặc cập nhật cấu hình SMTP vào cơ sở dữ liệu PostgreSQL
   */
  async saveSmtpConfig(dto: Partial<SmtpConfig>): Promise<{ success: boolean; message: string; config: SmtpStatus }> {
    // Nếu pass để trống, giữ lại pass đã lưu trước đó trong DB hoặc .env
    let finalPass = dto.pass?.trim();
    if (!finalPass) {
      if (this.cachedDbConfig?.pass) {
        finalPass = this.cachedDbConfig.pass;
      } else if (process.env.SMTP_PASS) {
        finalPass = process.env.SMTP_PASS;
      } else {
        finalPass = '';
      }
    }

    const newConfig: SmtpConfig = {
      host: dto.host?.trim() || 'smtp.gmail.com',
      port: Number(dto.port) || 587,
      secure: dto.secure ?? (Number(dto.port) === 465),
      user: dto.user?.trim() || '',
      pass: finalPass,
      from_name: dto.from_name?.trim() || 'NhanHoaCaptcha System',
      from_email: dto.from_email?.trim() || dto.user?.trim() || 'no-reply@nhanhoa.com',
      ignore_tls: Boolean(dto.ignore_tls),
    };

    await this.ensureSettingsTable();

    if (this.settingsRepo) {
      const setting = this.settingsRepo.create({
        key: 'smtp',
        value: newConfig,
      });
      await this.settingsRepo.save(setting);
    } else if (this.dataSource) {
      await this.dataSource.query(
        `INSERT INTO system_settings (key, value, updated_at) 
         VALUES ('smtp', $1, NOW()) 
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
        [JSON.stringify(newConfig)],
      );
    }

    this.cachedDbConfig = newConfig;
    this.logger.log(`💾 Đã lưu cấu hình SMTP mới vào database (Host: ${newConfig.host}:${newConfig.port}, User: ${newConfig.user})`);

    return {
      success: true,
      message: 'Cấu hình cổng email SMTP đã được lưu vào cơ sở dữ liệu thành công!',
      config: this.getSmtpStatus(),
    };
  }

  /**
   * Kiểm tra kết nối SMTP và gửi email thử nghiệm (nếu có email nhận)
   */
  async testConnection(
    targetEmail?: string,
    customConfig?: Partial<SmtpConfig>,
  ): Promise<{ success: boolean; message: string; details?: any }> {
    const config = this.getEffectiveConfig(customConfig);

    if (config.user && !config.pass) {
      return {
        success: false,
        message: 'Tài khoản SMTP có Username nhưng chưa nhập Mật khẩu / App Password.',
      };
    }

    try {
      const transporter = this.createTransporter(customConfig);
      // 1. Kiểm tra bắt tay (handshake) và xác thực máy chủ SMTP
      await transporter.verify();

      // 2. Nếu có email nhận -> Gửi thử 1 email test
      if (targetEmail) {
        const fromName = config.from_name || 'NhanHoaCaptcha System';
        const fromEmail = config.from_email || config.user || 'no-reply@nhanhoa.com';
        const sourceLabel = this.cachedDbConfig ? 'Cơ sở dữ liệu (PostgreSQL)' : 'Biến môi trường (.env)';
        
        const info = await transporter.sendMail({
          from: `"${fromName}" <${fromEmail}>`,
          to: targetEmail,
          subject: '[NhanHoaCaptcha] Kiểm tra kết nối cổng gửi email SMTP thành công',
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background: #ffffff;">
              <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                <span style="font-size: 24px;">🛡️</span>
                <h2 style="color: #2563eb; margin: 0; font-size: 20px;">NhanHoaCaptcha SMTP Test</h2>
              </div>
              <p style="color: #334155; font-size: 14px;">Xin chào Quản trị viên,</p>
              <p style="color: #334155; font-size: 14px;">Email này được gửi tự động để xác nhận cổng SMTP của hệ thống NhanHoaCaptcha đã hoạt động chính xác!</p>
              
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px; margin: 20px 0;">
                <div style="font-size: 12px; color: #64748b; margin-bottom: 6px;">THÔNG TIN KẾT NỐI SMTP:</div>
                <div style="font-size: 13px; color: #1e293b; margin: 4px 0;">• <b>Nguồn cấu hình:</b> ${sourceLabel}</div>
                <div style="font-size: 13px; color: #1e293b; margin: 4px 0;">• <b>Máy chủ:</b> ${config.host}:${config.port} (${config.secure ? 'SSL/TLS' : 'STARTTLS'})</div>
                <div style="font-size: 13px; color: #1e293b; margin: 4px 0;">• <b>Người gửi:</b> ${fromName} &lt;${fromEmail}&gt;</div>
                <div style="font-size: 13px; color: #1e293b; margin: 4px 0;">• <b>Thời gian kiểm tra:</b> ${new Date().toLocaleString('vi-VN')}</div>
              </div>

              <p style="color: #16a34a; font-weight: 600; font-size: 14px;">✓ Sẵn sàng gửi email kích hoạt tài khoản và cảnh báo quota!</p>
              
              <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 20px 0;" />
              <p style="color: #94a3b8; font-size: 12px; margin: 0;">Trân trọng,<br/>Đội ngũ Kỹ thuật NhanHoaCaptcha</p>
            </div>
          `,
        });

        return {
          success: true,
          message: `Kết nối SMTP thành công và đã gửi email thử nghiệm tới ${targetEmail}! (MessageId: ${info.messageId})`,
          details: { messageId: info.messageId },
        };
      }

      return {
        success: true,
        message: 'Kết nối và xác thực máy chủ SMTP thành công!',
      };
    } catch (err: any) {
      this.logger.error('Lỗi kết nối SMTP:', err);
      return {
        success: false,
        message: `Lỗi kết nối SMTP: ${err.message || err}`,
        details: err,
      };
    }
  }

  /**
   * Gửi email kích hoạt tài khoản người dùng
   */
  async sendActivationEmail(
    email: string, 
    name: string, 
    token: string, 
    requestBaseUrl?: string,
  ): Promise<SendMailResult> {
    const config = this.getEffectiveConfig();
    const isConfigured = Boolean(config.host && (config.user ? config.pass : true));

    if (!isConfigured) {
      this.logger.warn(`[MailService] Bỏ qua gửi email kích hoạt cho ${email} vì chưa cấu hình SMTP.`);
      return { success: false, error: 'smtp_not_configured' };
    }

    try {
      const transporter = this.createTransporter();

      // Link trỏ về trang /activate của Dashboard; trang đó gọi POST /admin/v1/auth/activate
      const dashboardUrl = (requestBaseUrl || resolveDashboardBaseUrl()).replace(/\/+$/, '');
      const activationLink = `${dashboardUrl}/activate?token=${encodeURIComponent(token)}`;
      const safeName = escapeHtml(name);

      const fromName = config.from_name;
      const fromEmail = config.from_email;

      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: email,
        subject: '[NhanHoaCaptcha] Kích hoạt tài khoản người dùng',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px; background: #ffffff;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
              <span style="font-size: 26px;">🛡️</span>
              <h2 style="color: #2563eb; margin: 0; font-size: 22px;">NhanHoaCaptcha</h2>
            </div>
            
            <p style="color: #334155; font-size: 15px;">Xin chào <strong>${safeName}</strong>,</p>
            <p style="color: #334155; font-size: 14px; line-height: 1.6;">
              Cảm ơn bạn đã đăng ký tài khoản trên hệ thống cổng bảo vệ Captcha nội bộ <strong>NhanHoaCaptcha</strong>.
            </p>
            
            <p style="color: #334155; font-size: 14px; line-height: 1.6;">
              Vui lòng bấm vào nút bên dưới để kích hoạt tài khoản của bạn và bắt đầu tích hợp:
            </p>

            <div style="text-align: center; margin: 28px 0;">
              <a href="${activationLink}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; font-weight: 600; font-size: 15px; border-radius: 8px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);">
                Kích Hoạt Tài Khoản Ngay →
              </a>
            </div>

            <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
              Nếu nút trên không bấm được, bạn có thể sao chép liên kết sau dán vào trình duyệt:<br/>
              <a href="${activationLink}" style="color: #2563eb; word-break: break-all;">${activationLink}</a>
            </p>

            <div style="background-color: #f8fafc; border-radius: 8px; padding: 12px 16px; margin: 24px 0; border-left: 4px solid #3b82f6;">
              <p style="margin: 0; font-size: 13px; color: #475569;">
                🎁 Tài khoản của bạn được khởi tạo với <strong>Gói Trải Nghiệm (Free Trial)</strong>: Hỗ trợ tối đa 2 tên miền và 10.000 requests/tháng.
              </p>
            </div>

            <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">Trân trọng,<br/>Đội ngũ Phát triển NhanHoaCaptcha</p>
          </div>
        `,
      });

      this.logger.log(`📧 [MailService] Đã gửi email kích hoạt tới ${email} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      this.logger.error(`❌ [MailService] Lỗi khi gửi email kích hoạt tới ${email}:`, err);
      return { success: false, error: err.message || 'send_failed' };
    }
  }

  /**
   * Gửi email cảnh báo hạn mức sử dụng Quota (80% hoặc 100%)
   */
  async sendQuotaWarningEmail(
    email: string,
    name: string,
    planName: string,
    used: number,
    limit: number,
    threshold: number,
  ): Promise<SendMailResult> {
    const config = this.getEffectiveConfig();
    const isConfigured = Boolean(config.host && (config.user ? config.pass : true));

    if (!isConfigured) {
      this.logger.warn(`[MailService] Bỏ qua gửi mail cảnh báo cho ${email} vì chưa cấu hình SMTP.`);
      return { success: false, error: 'smtp_not_configured' };
    }

    try {
      const transporter = this.createTransporter();
      const subject =
        threshold >= 100
          ? `[NhanHoaCaptcha] CẢNH BÁO: Tài khoản của bạn đã sử dụng hết 100% hạn mức Captcha!`
          : `[NhanHoaCaptcha] Cảnh báo: Tài khoản của bạn đã sử dụng 80% hạn mức Captcha`;

      const alertColor = threshold >= 100 ? '#ea5455' : '#ff9f43';
      const fromName = config.from_name || 'NhanHoaCaptcha Alert';
      const fromEmail = config.from_email || 'no-reply@nhanhoa.com';

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background: #ffffff;">
          <h2 style="color: ${alertColor}; margin-top: 0; font-size: 20px; display: flex; align-items: center; gap: 8px;">
            <span>⚠️</span> Thông Báo Dung Lượng Captcha
          </h2>
          <p style="color: #334155;">Xin chào <strong>${escapeHtml(name)}</strong>,</p>
          <p style="color: #334155;">Hệ thống NhanHoaCaptcha xin thông báo tài khoản của bạn đã đạt mốc <strong>${threshold}%</strong> hạn mức sử dụng trong tháng:</p>
          
          <div style="background-color: #f8fafc; border-left: 4px solid ${alertColor}; padding: 16px; margin: 20px 0; border-radius: 4px; border: 1px solid #e2e8f0; border-left-width: 4px;">
            <p style="margin: 4px 0; color: #1e293b;"><strong>Gói cước:</strong> ${planName}</p>
            <p style="margin: 4px 0; color: #1e293b;"><strong>Đã sử dụng:</strong> ${used.toLocaleString()} / ${limit.toLocaleString()} requests</p>
            <p style="margin: 4px 0; color: #1e293b;"><strong>Tỷ lệ tiêu thụ:</strong> ${Math.round((used / limit) * 100)}%</p>
          </div>

          ${
            threshold >= 100
              ? `<p style="color: #ea5455; font-weight: bold; background: #fef2f2; padding: 12px; border-radius: 6px; border: 1px solid #fecaca;">⚠️ Các request phát hành Captcha tiếp theo trên các website của bạn sẽ bị tạm dừng cho đến khi bạn nâng cấp gói cước mới hoặc bước sang chu kỳ tháng sau.</p>`
              : `<p style="color: #475569;">Để đảm bảo hoạt động xác thực của website không bị gián đoạn, bạn có thể liên hệ Quản trị viên để nâng cấp gói cước cao hơn.</p>`
          }

          <p style="margin-top: 24px; color: #94a3b8; font-size: 13px;">Trân trọng,<br/>Đội ngũ Kỹ thuật NhanHoaCaptcha</p>
        </div>
      `;

      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: email,
        subject,
        html,
      });

      this.logger.log(`📧 [MailService] Đã gửi email cảnh báo (${threshold}%) thành công tới: ${email} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      this.logger.error(`❌ [MailService] Lỗi khi gửi email cảnh báo tới ${email}:`, err);
      return { success: false, error: err.message || 'send_failed' };
    }
  }

  /**
   * Gửi email hướng dẫn đặt lại mật khẩu người dùng
   */
  async sendPasswordResetEmail(
    email: string,
    name: string,
    token: string,
    requestBaseUrl?: string,
  ): Promise<SendMailResult> {
    const config = this.getEffectiveConfig();
    const isConfigured = Boolean(config.host && (config.user ? config.pass : true));

    if (!isConfigured) {
      this.logger.warn(`[MailService] Bỏ qua gửi email đặt lại mật khẩu cho ${email} vì chưa cấu hình SMTP.`);
      return { success: false, error: 'smtp_not_configured' };
    }

    try {
      const transporter = this.createTransporter();

      const dashboardUrl = (requestBaseUrl || resolveDashboardBaseUrl()).replace(/\/+$/, '');
      const resetLink = `${dashboardUrl}/reset-password?token=${encodeURIComponent(token)}`;
      const safeName = escapeHtml(name);

      const fromName = config.from_name;
      const fromEmail = config.from_email;

      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromEmail}>`,
        to: email,
        subject: '[NhanHoaCaptcha] Yêu cầu đặt lại mật khẩu tài khoản',
        html: `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px; background: #ffffff;">
            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 20px;">
              <span style="font-size: 26px;">🛡️</span>
              <h2 style="color: #2563eb; margin: 0; font-size: 22px;">NhanHoaCaptcha</h2>
            </div>
            
            <p style="color: #334155; font-size: 15px;">Xin chào <strong>${safeName}</strong>,</p>
            <p style="color: #334155; font-size: 14px; line-height: 1.6;">
              Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn tại hệ thống <strong>NhanHoaCaptcha</strong>.
            </p>
            
            <p style="color: #334155; font-size: 14px; line-height: 1.6;">
              Vui lòng bấm vào nút bên dưới để tiến hành thiết lập mật khẩu mới:
            </p>

            <div style="text-align: center; margin: 28px 0;">
              <a href="${resetLink}" style="display: inline-block; background: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 28px; font-weight: 600; font-size: 15px; border-radius: 8px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.25);">
                Đặt Lại Mật Khẩu →
              </a>
            </div>

            <div style="background-color: #fef2f2; border-radius: 8px; padding: 12px 16px; margin: 24px 0; border-left: 4px solid #ef4444;">
              <p style="margin: 0; font-size: 13px; color: #991b1b;">
                ⏱️ <strong>Lưu ý bảo mật:</strong> Liên kết này chỉ có hiệu lực trong vòng <strong>15 phút</strong> và chỉ sử dụng được <strong>1 lần duy nhất</strong>.
              </p>
            </div>

            <p style="color: #64748b; font-size: 12px; line-height: 1.5;">
              Nếu nút trên không bấm được, bạn có thể sao chép liên kết sau dán vào trình duyệt:<br/>
              <a href="${resetLink}" style="color: #2563eb; word-break: break-all;">${resetLink}</a>
            </p>

            <p style="color: #94a3b8; font-size: 12px; line-height: 1.5; margin-top: 16px;">
              Nếu bạn không yêu cầu đặt lại mật khẩu, xin vui lòng bỏ qua email này hoặc liên hệ quản trị viên nếu thấy nghi ngờ.
            </p>

            <hr style="border: none; border-top: 1px solid #f1f5f9; margin: 24px 0;" />
            <p style="color: #94a3b8; font-size: 12px; margin: 0;">Trân trọng,<br/>Đội ngũ Kỹ thuật NhanHoaCaptcha</p>
          </div>
        `,
      });

      this.logger.log(`📧 [MailService] Đã gửi email đặt lại mật khẩu tới ${email} (MessageId: ${info.messageId})`);
      return { success: true, messageId: info.messageId };
    } catch (err: any) {
      this.logger.error(`❌ [MailService] Lỗi khi gửi email đặt lại mật khẩu tới ${email}:`, err);
      return { success: false, error: err.message || 'send_failed' };
    }
  }
}
