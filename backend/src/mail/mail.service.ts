import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

export interface SmtpStatus {
  is_configured: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  from_name: string;
  from_email: string;
  ignore_tls: boolean;
}

export interface SendMailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  /**
   * Khởi tạo Transporter Nodemailer từ biến môi trường
   */
  private createTransporter(customConfig?: Partial<{
    host: string;
    port: number;
    secure: boolean;
    user: string;
    pass: string;
    ignoreTls: boolean;
  }>) {
    const host = customConfig?.host || process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = customConfig?.port ?? (parseInt(process.env.SMTP_PORT || '587', 10) || 587);
    const user = customConfig?.user ?? (process.env.SMTP_USER || '');
    const pass = customConfig?.pass ?? (process.env.SMTP_PASS || '');
    
    // Tự động suy luận secure: true nếu port 465 hoặc cấu hình SMTP_SECURE=true
    const secure = customConfig?.secure ?? (
      process.env.SMTP_SECURE === 'true' || port === 465
    );

    const ignoreTls = customConfig?.ignoreTls ?? (
      process.env.SMTP_IGNORE_TLS === 'true' || process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'false'
    );

    const transportOptions: nodemailer.TransportOptions = {
      host,
      port,
      secure,
      auth: user && pass ? { user, pass } : undefined,
      tls: ignoreTls ? { rejectUnauthorized: false } : undefined,
    } as any;

    return nodemailer.createTransport(transportOptions);
  }

  /**
   * Lấy thông tin cấu hình SMTP hiện tại (ẩn mật khẩu)
   */
  getSmtpStatus(): SmtpStatus {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.SMTP_PORT || '587', 10) || 587;
    const user = process.env.SMTP_USER || '';
    const pass = process.env.SMTP_PASS || '';
    const secure = process.env.SMTP_SECURE === 'true' || port === 465;
    const fromName = process.env.SMTP_FROM_NAME || 'NhanHoaCaptcha System';
    const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || user || 'no-reply@nhanhoa.com';
    const ignoreTls = process.env.SMTP_IGNORE_TLS === 'true' || process.env.SMTP_TLS_REJECT_UNAUTHORIZED === 'false';

    return {
      is_configured: Boolean(user && pass),
      host,
      port,
      secure,
      user: user ? user.replace(/(.{2})(.*)(@.*)/, '$1***$3') : '',
      from_name: fromName,
      from_email: fromEmail,
      ignore_tls: ignoreTls,
    };
  }

  /**
   * Kiểm tra kết nối SMTP và gửi email thử nghiệm (nếu có email nhận)
   */
  async testConnection(targetEmail?: string): Promise<{ success: boolean; message: string; details?: any }> {
    const status = this.getSmtpStatus();
    if (!status.is_configured) {
      return {
        success: false,
        message: 'Chưa cấu hình thông tin đăng nhập SMTP (SMTP_USER / SMTP_PASS). Vui lòng kiểm tra file .env',
      };
    }

    try {
      const transporter = this.createTransporter();
      // 1. Kiểm tra xác thực máy chủ SMTP
      await transporter.verify();

      // 2. Nếu có email nhận -> Gửi thử 1 email test
      if (targetEmail) {
        const fromName = process.env.SMTP_FROM_NAME || 'NhanHoaCaptcha System';
        const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@nhanhoa.com';
        
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
                <div style="font-size: 13px; color: #1e293b; margin: 4px 0;">• <b>Máy chủ:</b> ${status.host}:${status.port} (${status.secure ? 'SSL/TLS' : 'STARTTLS'})</div>
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
  async sendActivationEmail(email: string, name: string, token: string): Promise<SendMailResult> {
    const status = this.getSmtpStatus();
    if (!status.is_configured) {
      this.logger.warn(`[MailService] Bỏ qua gửi email kích hoạt cho ${email} vì chưa cấu hình SMTP.`);
      return { success: false, error: 'smtp_not_configured' };
    }

    try {
      const transporter = this.createTransporter();
      const appUrl = process.env.APP_URL || process.env.DASHBOARD_URL || 'http://localhost:3068';
      const activationLink = `${appUrl}/admin/v1/auth/activate?token=${token}`;

      const fromName = process.env.SMTP_FROM_NAME || 'NhanHoaCaptcha System';
      const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@nhanhoa.com';

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
            
            <p style="color: #334155; font-size: 15px;">Xin chào <strong>${name}</strong>,</p>
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
    const status = this.getSmtpStatus();
    if (!status.is_configured) {
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
      const fromName = process.env.SMTP_FROM_NAME || 'NhanHoaCaptcha Alert';
      const fromEmail = process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@nhanhoa.com';

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; padding: 24px; background: #ffffff;">
          <h2 style="color: ${alertColor}; margin-top: 0; font-size: 20px; display: flex; align-items: center; gap: 8px;">
            <span>⚠️</span> Thông Báo Dung Lượng Captcha
          </h2>
          <p style="color: #334155;">Xin chào <strong>${name}</strong>,</p>
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
}
