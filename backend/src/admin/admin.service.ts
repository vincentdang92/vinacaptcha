import { Injectable, NotFoundException, UnauthorizedException, BadRequestException, ForbiddenException, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Site } from './entities/site.entity.js';
import { ApiKey } from './entities/api-key.entity.js';
import { Account } from './entities/account.entity.js';
import { Plan } from './entities/plan.entity.js';
import { RedisService } from '../redis/redis.service.js';
import { MailService } from '../mail/mail.service.js';
import { VerifyService } from '../verify/verify.service.js';
import * as crypto from 'crypto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Site) private sitesRepo: Repository<Site>,
    @InjectRepository(ApiKey) private apiKeysRepo: Repository<ApiKey>,
    @InjectRepository(Account) private accountsRepo: Repository<Account>,
    @InjectRepository(Plan) private plansRepo: Repository<Plan>,
    private dataSource: DataSource,
    private redisService: RedisService,
    private mailService: MailService,
    @Optional() private verifyService?: VerifyService,
  ) {}

  async getDashboardStats(accountId?: string, role?: string) {
    if (role !== 'admin' && accountId) {
      // 1. Thống kê theo riêng tài khoản người dùng
      const totalSitesRes = await this.dataSource.query('SELECT COUNT(*) as count FROM sites WHERE account_id = $1', [accountId]);
      const activeSitesRes = await this.dataSource.query(`SELECT COUNT(*) as count FROM sites WHERE account_id = $1 AND status = 'active'`, [accountId]);
      const totalRequestsRes = await this.dataSource.query(`
        SELECT COUNT(*) as count 
        FROM verification_logs vl
        JOIN sites s ON s.id = vl.site_id
        WHERE s.account_id = $1
      `, [accountId]);
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
        JOIN sites s ON s.id = vl.site_id
        WHERE s.account_id = $1
        ORDER BY vl.created_at DESC 
        LIMIT 10
      `, [accountId]);

      const chartData = await this.dataSource.query(`
        SELECT DATE(vl.created_at) as date, 
               SUM(CASE WHEN vl.result = 'pass' THEN 1 ELSE 0 END) as passed,
               SUM(CASE WHEN vl.result = 'fail' THEN 1 ELSE 0 END) as failed
        FROM verification_logs vl
        JOIN sites s ON s.id = vl.site_id
        WHERE s.account_id = $1
        GROUP BY DATE(vl.created_at)
        ORDER BY date ASC
        LIMIT 7
      `, [accountId]);

      const formattedChartData = chartData.map((item: any) => ({
        date: item.date,
        passed: parseInt(item.passed, 10) || 0,
        failed: parseInt(item.failed, 10) || 0,
      }));

      // Marketing & Device Analytics
      let utmCampaigns: Array<{ campaign: string; source: string; total: number; passCount: number; failCount: number }> = [];
      let topDevices = { mobile: 0, desktop: 0, touchScreenPct: 0 };
      let avgMetrics = { avgTimeOnPageMs: 0, avgScrollDepthPct: 0, pasteDetectedCount: 0 };

      try {
        const marketingQuery = await this.dataSource.query(`
          SELECT 
            COALESCE(vl.risk_breakdown->'clientSignals'->>'utm_campaign', 'Direct / Organic') AS campaign,
            COALESCE(vl.risk_breakdown->'clientSignals'->>'utm_source', 'Direct') AS source,
            COUNT(*) as total,
            SUM(CASE WHEN vl.result = 'pass' THEN 1 ELSE 0 END) as pass_count,
            SUM(CASE WHEN vl.result = 'fail' THEN 1 ELSE 0 END) as fail_count
          FROM verification_logs vl
          JOIN sites s ON s.id = vl.site_id
          WHERE s.account_id = $1 AND vl.risk_breakdown IS NOT NULL
          GROUP BY campaign, source
          ORDER BY total DESC
          LIMIT 8
        `, [accountId]);

        utmCampaigns = (marketingQuery || []).map((m: any) => ({
          campaign: m.campaign || 'Direct / Organic',
          source: m.source || 'Direct',
          total: parseInt(m.total, 10) || 0,
          passCount: parseInt(m.pass_count, 10) || 0,
          failCount: parseInt(m.fail_count, 10) || 0,
        }));
      } catch {}

      try {
        const deviceQuery = await this.dataSource.query(`
          SELECT 
            COUNT(*) as total_samples,
            SUM(CASE WHEN (vl.risk_breakdown->'clientSignals'->>'touch_support')::boolean = true THEN 1 ELSE 0 END) as touch_count,
            SUM(CASE WHEN (vl.risk_breakdown->'clientSignals'->>'screen_width')::int < 768 THEN 1 ELSE 0 END) as mobile_count,
            AVG(COALESCE((vl.risk_breakdown->'clientSignals'->>'time_on_page_ms')::numeric, 0)) as avg_time,
            AVG(COALESCE((vl.risk_breakdown->'clientSignals'->>'scroll_depth_pct')::numeric, 0)) as avg_scroll,
            SUM(CASE WHEN (vl.risk_breakdown->'clientSignals'->>'paste_detected')::boolean = true THEN 1 ELSE 0 END) as paste_count
          FROM verification_logs vl
          JOIN sites s ON s.id = vl.site_id
          WHERE s.account_id = $1 AND vl.risk_breakdown IS NOT NULL
        `, [accountId]);

        if (deviceQuery && deviceQuery.length > 0 && deviceQuery[0].total_samples > 0) {
          const total = parseInt(deviceQuery[0].total_samples, 10) || 1;
          const mobile = parseInt(deviceQuery[0].mobile_count, 10) || 0;
          const touch = parseInt(deviceQuery[0].touch_count, 10) || 0;
          topDevices = {
            mobile,
            desktop: Math.max(0, total - mobile),
            touchScreenPct: Math.round((touch / total) * 100),
          };
          avgMetrics = {
            avgTimeOnPageMs: Math.round(parseFloat(deviceQuery[0].avg_time) || 0),
            avgScrollDepthPct: Math.round(parseFloat(deviceQuery[0].avg_scroll) || 0),
            pasteDetectedCount: parseInt(deviceQuery[0].paste_count, 10) || 0,
          };
        }
      } catch {}

      return {
        totalSites: parseInt(totalSitesRes[0]?.count || '0', 10),
        activeSites: parseInt(activeSitesRes[0]?.count || '0', 10),
        totalRequests: parseInt(totalRequestsRes[0]?.count || '0', 10),
        knowledgeBaseIps: parseInt(threatIntelRes[0]?.count || '0', 10),
        bannedIps: parseInt(bannedIpsRes[0]?.count || '0', 10),
        recentLogs: recentLogs || [],
        chartData: formattedChartData,
        marketingStats: {
          utmCampaigns,
          deviceBreakdown: topDevices,
          userEngagement: avgMetrics,
        },
        last_synced_at: new Date().toISOString(),
      };
    }

    // 1. Kiểm tra cache Redis O(1) in-memory cho admin
    const cachedStats = await this.redisService.getDashboardStatsCache();
    if (cachedStats) {
      return cachedStats;
    }

    // 2. Queries from real database tables
    const totalSitesRes = await this.dataSource.query('SELECT COUNT(*) as count FROM sites');
    const activeSitesRes = await this.dataSource.query(`SELECT COUNT(*) as count FROM sites WHERE status = 'active'`);
    const totalRequestsRes = await this.dataSource.query('SELECT COUNT(*) as count FROM verification_logs');
    const threatIntelRes = await this.dataSource.query('SELECT COUNT(*) as count FROM threat_intel_ranges');
    const bannedIpsRes = await this.dataSource.query('SELECT COUNT(*) as count FROM ip_reputation WHERE fail_count > 10');

    // Recent verifications for Data Table — join với sites để lấy domain
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

    // Stats for Chart (grouped by date)
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

    // Marketing & Device Analytics (Admin level)
    let utmCampaigns: Array<{ campaign: string; source: string; total: number; passCount: number; failCount: number }> = [];
    let topDevices = { mobile: 0, desktop: 0, touchScreenPct: 0 };
    let avgMetrics = { avgTimeOnPageMs: 0, avgScrollDepthPct: 0, pasteDetectedCount: 0 };

    try {
      const marketingQuery = await this.dataSource.query(`
        SELECT 
          COALESCE(vl.risk_breakdown->'clientSignals'->>'utm_campaign', 'Direct / Organic') AS campaign,
          COALESCE(vl.risk_breakdown->'clientSignals'->>'utm_source', 'Direct') AS source,
          COUNT(*) as total,
          SUM(CASE WHEN vl.result = 'pass' THEN 1 ELSE 0 END) as pass_count,
          SUM(CASE WHEN vl.result = 'fail' THEN 1 ELSE 0 END) as fail_count
        FROM verification_logs vl
        WHERE vl.risk_breakdown IS NOT NULL
        GROUP BY campaign, source
        ORDER BY total DESC
        LIMIT 8
      `);

      utmCampaigns = (marketingQuery || []).map((m: any) => ({
        campaign: m.campaign || 'Direct / Organic',
        source: m.source || 'Direct',
        total: parseInt(m.total, 10) || 0,
        passCount: parseInt(m.pass_count, 10) || 0,
        failCount: parseInt(m.fail_count, 10) || 0,
      }));
    } catch {}

    try {
      const deviceQuery = await this.dataSource.query(`
        SELECT 
          COUNT(*) as total_samples,
          SUM(CASE WHEN (vl.risk_breakdown->'clientSignals'->>'touch_support')::boolean = true THEN 1 ELSE 0 END) as touch_count,
          SUM(CASE WHEN (vl.risk_breakdown->'clientSignals'->>'screen_width')::int < 768 THEN 1 ELSE 0 END) as mobile_count,
          AVG(COALESCE((vl.risk_breakdown->'clientSignals'->>'time_on_page_ms')::numeric, 0)) as avg_time,
          AVG(COALESCE((vl.risk_breakdown->'clientSignals'->>'scroll_depth_pct')::numeric, 0)) as avg_scroll,
          SUM(CASE WHEN (vl.risk_breakdown->'clientSignals'->>'paste_detected')::boolean = true THEN 1 ELSE 0 END) as paste_count
        FROM verification_logs vl
        WHERE vl.risk_breakdown IS NOT NULL
      `);

      if (deviceQuery && deviceQuery.length > 0 && deviceQuery[0].total_samples > 0) {
        const total = parseInt(deviceQuery[0].total_samples, 10) || 1;
        const mobile = parseInt(deviceQuery[0].mobile_count, 10) || 0;
        const touch = parseInt(deviceQuery[0].touch_count, 10) || 0;
        topDevices = {
          mobile,
          desktop: Math.max(0, total - mobile),
          touchScreenPct: Math.round((touch / total) * 100),
        };
        avgMetrics = {
          avgTimeOnPageMs: Math.round(parseFloat(deviceQuery[0].avg_time) || 0),
          avgScrollDepthPct: Math.round(parseFloat(deviceQuery[0].avg_scroll) || 0),
          pasteDetectedCount: parseInt(deviceQuery[0].paste_count, 10) || 0,
        };
      }
    } catch {}

    const result = {
      totalSites: parseInt(totalSitesRes[0]?.count || '0', 10),
      activeSites: parseInt(activeSitesRes[0]?.count || '0', 10),
      totalRequests: parseInt(totalRequestsRes[0]?.count || '0', 10),
      knowledgeBaseIps: parseInt(threatIntelRes[0]?.count || '0', 10),
      bannedIps: parseInt(bannedIpsRes[0]?.count || '0', 10),
      recentLogs: recentLogs || [],
      chartData: formattedChartData,
      marketingStats: {
        utmCampaigns,
        deviceBreakdown: topDevices,
        userEngagement: avgMetrics,
      },
      last_synced_at: new Date().toISOString(),
    };

    // Lưu vào Redis cache với TTL 300s (5 phút)
    await this.redisService.setDashboardStatsCache(result, 300);

    return result;
  }

  // ─── KHỞI TẠO HỆ THỐNG DẠNG CMS WIZARD ──────────────────────────────────────

  async getSetupStatus(): Promise<{ is_setup: boolean; has_admin: boolean }> {
    const adminCount = await this.accountsRepo.count({ where: { role: 'admin' } });
    return {
      is_setup: adminCount > 0,
      has_admin: adminCount > 0,
    };
  }

  async runSetup(body: {
    app_name?: string;
    primary_domain?: string;
    admin_name: string;
    admin_email: string;
    admin_password: string;
  }) {
    const adminCount = await this.accountsRepo.count({ where: { role: 'admin' } });
    if (adminCount > 0) {
      throw new ForbiddenException('Hệ thống đã được thiết lập trước đó. Không thể thiết lập lại.');
    }

    if (!body?.admin_email || !body?.admin_password || !body?.admin_name) {
      throw new BadRequestException('Họ tên, email và mật khẩu quản trị là bắt buộc.');
    }

    if (body.admin_password.trim().length < 6) {
      throw new BadRequestException('Mật khẩu quản trị phải có ít nhất 6 ký tự.');
    }

    // 1. Đảm bảo các gói cước mặc định tồn tại
    let enterprisePlan = await this.plansRepo.findOneBy({ code: 'enterprise' });
    if (!enterprisePlan) {
      enterprisePlan = this.plansRepo.create({
        code: 'enterprise',
        name: 'Gói Doanh Nghiệp (Enterprise)',
        max_domains: 100,
        max_requests: 5000000,
      });
      await this.plansRepo.save(enterprisePlan);
    }

    let defaultPlan = await this.plansRepo.findOneBy({ code: 'default' });
    if (!defaultPlan) {
      defaultPlan = this.plansRepo.create({
        code: 'default',
        name: 'Gói Trải Nghiệm',
        max_domains: 2,
        max_requests: 10000,
      });
      await this.plansRepo.save(defaultPlan);
    }

    // 2. Tạo tài khoản Super Admin
    const salt = process.env.APP_SALT || process.env.JWT_SECRET || 'vina_captcha_salt_2026';
    const passwordHash = crypto.createHash('sha256').update(body.admin_password.trim() + salt).digest('hex');

    const admin = this.accountsRepo.create({
      email: body.admin_email.trim().toLowerCase(),
      password_hash: passwordHash,
      name: body.admin_name.trim(),
      status: 'active',
      role: 'admin',
      is_verified: true,
      plan: enterprisePlan,
    });
    await this.accountsRepo.save(admin);

    // 3. Khởi tạo Website mặc định đầu tiên nếu có domain
    const domain = (body.primary_domain || 'localhost').trim().toLowerCase().replace(/^https?:\/\//, '').split('/')[0];
    const siteName = (body.app_name || 'Website Đầu Tiên').trim();

    const site = this.sitesRepo.create({
      account: admin,
      name: siteName,
      platform: 'web',
      primary_domain: domain,
      allowed_domains: [domain, 'localhost', '127.0.0.1'],
      challenge_mode: 'auto',
      status: 'active',
    });
    await this.sitesRepo.save(site);

    // 4. Tạo API Key mặc định đầu tiên
    const rawKey = `cap_live_${crypto.randomBytes(12).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 13);

    const apiKey = this.apiKeysRepo.create({
      site_id: site.id,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      label: 'Production Key Khởi Tạo',
    });
    await this.apiKeysRepo.save(apiKey);

    // 5. Sinh JWT Token để tự động đăng nhập
    const payload = {
      sub: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role,
      exp: Math.floor(Date.now() / 1000) + 86400 * 7,
    };
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const bBody = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const secret = process.env.JWT_SECRET || 'vina-captcha-jwt-secret-key-3068';
    const signature = crypto.createHmac('sha256', secret).update(`${header}.${bBody}`).digest('base64url');
    const accessToken = `${header}.${bBody}.${signature}`;
    const refreshToken = `rf_${crypto.randomBytes(24).toString('hex')}`;

    return {
      success: true,
      message: 'Khởi tạo hệ thống NhanHoaCaptcha thành công!',
      access_token: accessToken,
      refresh_token: refreshToken,
      account: {
        id: admin.id,
        email: admin.email,
        name: admin.name,
        role: admin.role,
        status: admin.status,
      },
      initial_site: {
        id: site.id,
        name: site.name,
        primary_domain: site.primary_domain,
        challenge_mode: site.challenge_mode,
        api_key: rawKey,
      },
    };
  }

  async verifyAuthCaptcha(captchaToken?: string) {
    if (process.env.AUTH_CAPTCHA_DISABLED === 'true') {
      return true;
    }

    if (!captchaToken || typeof captchaToken !== 'string' || !captchaToken.trim()) {
      throw new BadRequestException('Vui lòng hoàn thành xác thực Slider Captcha trước khi tiếp tục.');
    }

    if (!this.verifyService) {
      return true;
    }

    const secret = process.env.AUTH_CAPTCHA_SECRET || 'cap_live_6f1a95f9fedee61651fae43c';
    const result = await this.verifyService.siteVerify({
      secret,
      verify_token: captchaToken.trim(),
    });

    if (!result.success) {
      throw new BadRequestException(`Xác thực Slider Captcha không hợp lệ (${result.reason || 'failed'}). Vui lòng kéo lại thanh trượt.`);
    }
    return true;
  }

  async register(email: string, password: string, name: string, requestBaseUrl?: string, captchaToken?: string) {
    await this.verifyAuthCaptcha(captchaToken);

    const cleanEmail = email?.trim().toLowerCase();
    const existing = await this.accountsRepo.findOneBy({ email: cleanEmail });
    if (existing) {
      throw new BadRequestException('Email đã được sử dụng');
    }

    const salt = process.env.APP_SALT || process.env.JWT_SECRET || 'vina_captcha_salt_2026';
    const passwordHash = crypto.createHash('sha256').update(password.trim() + salt).digest('hex');
    const activationToken = crypto.randomBytes(32).toString('hex');

    let defaultPlan = await this.plansRepo.findOneBy({ code: 'default' });
    if (!defaultPlan) {
      // Đảm bảo gói default tồn tại (fallback nếu seed lỗi)
      defaultPlan = this.plansRepo.create({
        code: 'default',
        name: 'Gói Trải Nghiệm',
        max_domains: 2,
        max_requests: 10000,
      });
      await this.plansRepo.save(defaultPlan);
    }

    const acc = this.accountsRepo.create({
      email: cleanEmail,
      password_hash: passwordHash,
      name: name?.trim(),
      status: 'active',
      is_verified: false,
      activation_token: activationToken,
      plan: defaultPlan,
    });
    
    await this.accountsRepo.save(acc);

    // Gửi email kích hoạt tài khoản qua MailService với baseUrl động
    await this.mailService.sendActivationEmail(cleanEmail, name, activationToken, requestBaseUrl);

    return { success: true, message: 'Đăng ký thành công, vui lòng kiểm tra email để kích hoạt.' };
  }

  // ─── Quản lý Cấu hình SMTP Email ──────────────────────────────────────────

  getSmtpStatus() {
    return this.mailService.getSmtpStatus();
  }

  async saveSmtpConfig(config: any) {
    return this.mailService.saveSmtpConfig(config);
  }

  async testSmtpConnection(targetEmail?: string, customConfig?: any) {
    return this.mailService.testConnection(targetEmail, customConfig);
  }


  async activateAccount(token: string) {
    const acc = await this.accountsRepo.findOneBy({ activation_token: token });
    if (!acc) {
      throw new BadRequestException('Token không hợp lệ hoặc đã hết hạn');
    }
    
    acc.is_verified = true;
    acc.activation_token = '';
    await this.accountsRepo.save(acc);
    return { success: true, message: 'Tài khoản đã được kích hoạt thành công.' };
  }

  async login(email: string, password: string, captchaToken?: string) {
    await this.verifyAuthCaptcha(captchaToken);

    const cleanEmail = email?.trim().toLowerCase();
    const acc = await this.accountsRepo.findOneBy({ email: cleanEmail });
    if (!acc) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    const salt = process.env.APP_SALT || process.env.JWT_SECRET || 'vina_captcha_salt_2026';
    const passwordHash = crypto.createHash('sha256').update(password.trim() + salt).digest('hex');

    if (acc.password_hash !== passwordHash) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    if (acc.status !== 'active') {
      throw new UnauthorizedException('Tài khoản đã bị tạm khóa. Vui lòng liên hệ quản trị viên.');
    }

    if (!acc.is_verified) {
      throw new UnauthorizedException('Tài khoản chưa được kích hoạt. Vui lòng kiểm tra email.');
    }

    const payload = {
      sub: acc.id,
      email: acc.email,
      name: acc.name,
      role: acc.role,
      exp: Math.floor(Date.now() / 1000) + 3600 * 24, // 24h
    };
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const secret = process.env.JWT_SECRET || 'vina-captcha-jwt-secret-key-3068';
    const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url');
    const accessToken = `${header}.${body}.${signature}`;
    const refreshToken = `rf_${crypto.randomBytes(24).toString('hex')}`;

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      expires_in: 86400,
      account: {
        id: acc.id,
        email: acc.email,
        name: acc.name,
        status: acc.status,
        role: acc.role,
      },
    };
  }

  // --- Quản lý Account & Plan (Admin) ---

  async getAccounts(start: number, end: number, res?: any) {
    const [data, total] = await this.accountsRepo.findAndCount({
      relations: { plan: true },
      order: { created_at: 'DESC' },
      skip: start,
      take: end - start,
    });
    
    if (res && res.header) {
      res.header('x-total-count', total.toString());
      res.header('Access-Control-Expose-Headers', 'x-total-count');
    }
    return data;
  }

  async getAccountById(id: string) {
    const acc = await this.accountsRepo.findOne({
      where: { id },
      relations: { plan: true },
    });
    if (!acc) throw new NotFoundException('Account không tồn tại');
    return acc;
  }

  async updateAccount(id: string, body: any) {
    const acc = await this.getAccountById(id);
    if (body.status) acc.status = body.status;
    if (body.role) acc.role = body.role;
    if (body.password && body.password.trim().length > 0) {
      const salt = 'vina_captcha_salt_2026';
      acc.password_hash = crypto.createHash('sha256').update(body.password.trim() + salt).digest('hex');
    }
    if (body.plan_id) {
      const plan = await this.plansRepo.findOneBy({ id: body.plan_id });
      if (plan) acc.plan = plan;
    }
    const saved = await this.accountsRepo.save(acc);
    // Invalidate API key metadata cache để áp dụng ngay gói cước mới
    await this.redisService.invalidateAllApiKeyCache();
    return saved;
  }

  async getAccountQuotaStatus(accountId: string) {
    const acc = await this.accountsRepo.findOne({
      where: { id: accountId },
      relations: { plan: true },
    });
    if (!acc) throw new NotFoundException('Account not found');

    const maxRequests = acc.plan?.max_requests || 10000;
    const currentUsed = await this.redisService.getAccountMonthlyUsage(accountId);
    const percentage = Math.min(100, Math.round((currentUsed / maxRequests) * 100));

    return {
      account_id: accountId,
      plan_name: acc.plan?.name || 'Gói Mặc Định',
      max_requests: maxRequests,
      used_requests: currentUsed,
      remaining_requests: Math.max(0, maxRequests - currentUsed),
      percentage,
    };
  }

  async getPlans() {
    return this.plansRepo.find({ order: { created_at: 'ASC' } });
  }

  async createSite(accountId: string, body: any) {
    const acc = await this.accountsRepo.findOne({
      where: { id: accountId }, 
      relations: { plan: true },
    });
    
    if (!acc) throw new NotFoundException('Account not found');
    
    // Nếu truyền JWT, ta có thể lấy accountId từ request. Tạm thời check limit ở đây.
    if (acc?.plan) {
      const allowedDomainsCount = Array.isArray(body.allowed_domains) ? body.allowed_domains.length : 0;
      // Tính cả primary_domain = 1 + số allowed_domains
      const totalDomains = 1 + allowedDomainsCount;
      if (totalDomains > acc.plan.max_domains) {
        throw new BadRequestException(`Gói của bạn chỉ cho phép tối đa ${acc.plan.max_domains} domains.`);
      }
    }

    const site = this.sitesRepo.create({
      account: acc,
      name: body.name,
      platform: body.platform || 'web',
      primary_domain: body.primary_domain,
      allowed_domains: body.allowed_domains || [],
      challenge_mode: body.challenge_mode || 'auto',
      status: body.status || 'active',
    });
    const saved = await this.sitesRepo.save(site);
    await this.redisService.invalidateCorsDomainsCache();
    return saved;
  }

  async getSites(page: number, limit: number, accountId?: string, role?: string) {
    const where: any = {};
    if (role !== 'admin' && accountId) {
      where.account = { id: accountId };
    }

    const [data, total] = await this.sitesRepo.findAndCount({
      where,
      skip: (page - 1) * limit,
      take: limit,
      order: { created_at: 'DESC' }
    });
    return { data, total };
  }

  async getSiteById(id: string, accountId?: string, role?: string) {
    const site = await this.sitesRepo.findOne({
      where: { id },
      relations: { account: true }
    });
    if (!site) throw new NotFoundException('Site not found');
    if (role !== 'admin' && site.account?.id !== accountId) {
      throw new ForbiddenException('Bạn không có quyền truy cập site này');
    }
    return site;
  }

  async updateSite(id: string, dto: Partial<Site>, accountId?: string, role?: string) {
    await this.getSiteById(id, accountId, role); // check permission
    await this.sitesRepo.update(id, dto);
    await this.redisService.invalidateAllApiKeyCache();
    await this.redisService.invalidateCorsDomainsCache();
    return this.getSiteById(id, accountId, role);
  }

  async deleteSite(id: string, accountId?: string, role?: string) {
    await this.getSiteById(id, accountId, role); // check permission
    await this.sitesRepo.delete(id);
    await this.redisService.invalidateAllApiKeyCache();
    await this.redisService.invalidateCorsDomainsCache();
    return { success: true };
  }

  // API KEYS
  async getApiKeys(siteId: string, accountId?: string, role?: string) {
    await this.getSiteById(siteId, accountId, role); // check permission
    const keys = await this.apiKeysRepo.find({ where: { site_id: siteId } });
    return { data: keys, total: keys.length };
  }

  async createApiKey(siteId: string, label: string, accountId?: string, role?: string) {
    await this.getSiteById(siteId, accountId, role); // check permission
    const rawKey = `cap_live_${crypto.randomBytes(12).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.substring(0, 13); // cap_live_xxxx

    const key = this.apiKeysRepo.create({
      site_id: siteId,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      label,
    });
    await this.apiKeysRepo.save(key);
    await this.redisService.invalidateAllApiKeyCache();

    return {
      id: key.id,
      key: rawKey,
      key_prefix: keyPrefix,
      label: key.label,
      created_at: key.created_at
    };
  }

  async revokeApiKey(siteId: string, keyId: string, accountId?: string, role?: string) {
    await this.getSiteById(siteId, accountId, role); // check permission
    await this.apiKeysRepo.update({ id: keyId, site_id: siteId }, { revoked_at: new Date() });
    await this.redisService.invalidateAllApiKeyCache();
    return { success: true };
  }

  /**
   * Lấy danh sách dải IP trong bảng threat_intel_ranges có phân trang + filter theo source
   */
  async getThreatIntel(start: number, end: number, source: string | undefined, res: any) {
    const limit = Math.max(1, end - start);

    const whereClause = source ? `WHERE source = '${source.replace(/'/g, "''")}'` : '';

    const [rows, countRes] = await Promise.all([
      this.dataSource.query(
        `SELECT id, source, category, cidr::text as cidr, fetched_at
         FROM threat_intel_ranges
         ${whereClause}
         ORDER BY fetched_at DESC, source ASC
         LIMIT ${limit} OFFSET ${start}`,
      ),
      this.dataSource.query(`SELECT COUNT(*) as count FROM threat_intel_ranges ${whereClause}`),
    ]);

    const total = parseInt(countRes[0]?.count || '0', 10);
    res?.header?.('X-Total-Count', total.toString());
    res?.header?.('Access-Control-Expose-Headers', 'X-Total-Count');

    // Trả về kèm summary theo source để Dashboard hiển thị
    const summaryRes = await this.dataSource.query(
      `SELECT source, category, COUNT(*) as count, MAX(fetched_at) as last_synced
       FROM threat_intel_ranges
       GROUP BY source, category
       ORDER BY count DESC`,
    );

    return {
      data: rows,
      total,
      summary: summaryRes.map((s: any) => ({
        source: s.source,
        category: s.category,
        count: parseInt(s.count, 10),
        last_synced: s.last_synced,
      })),
    };
  }

  // IP REPUTATION ─────────────────────────────────────────────────────────────

  async getIpReputation(start: number, end: number, res?: any) {
    const limit = Math.max(1, end - start);
    
    // Convert cidr to string format explicitly to avoid array/object serialization issues from node-postgres
    const [rows, countRes] = await Promise.all([
      this.dataSource.query(
        `SELECT ip_cidr::text as ip_cidr, fail_count, site_count_seen, last_seen_at
         FROM ip_reputation
         ORDER BY fail_count DESC, last_seen_at DESC
         LIMIT $1 OFFSET $2`,
         [limit, start]
      ),
      this.dataSource.query(`SELECT COUNT(*) as count FROM ip_reputation`),
    ]);

    const total = parseInt(countRes[0]?.count || '0', 10);
    res?.header?.('X-Total-Count', total.toString());
    res?.header?.('Access-Control-Expose-Headers', 'X-Total-Count');

    const data = rows.map((r: any) => ({
      id: r.ip_cidr,      // Refine cần trường `id` cho row key
      ip_cidr: r.ip_cidr,
      fail_count: r.fail_count,
      site_count_seen: r.site_count_seen,
      is_banned: r.fail_count > 10,
      last_seen_at: r.last_seen_at,
    }));

    // Refine simple-rest data provider expects: array response body + X-Total-Count header
    return data;
  }

  async setIpBanStatus(ip: string, isBanned: boolean) {
    // If banned, set fail_count = 11 to trigger is_banned logic. If unbanned, reset to 0
    const failCount = isBanned ? 11 : 0;
    
    await this.dataSource.query(`
      INSERT INTO ip_reputation (ip_cidr, fail_count, last_seen_at)
      VALUES ($1::inet, $2, NOW())
      ON CONFLICT (ip_cidr) DO UPDATE 
      SET fail_count = EXCLUDED.fail_count,
          last_seen_at = EXCLUDED.last_seen_at
    `, [ip, failCount]);

    return { success: true, ip, is_banned: isBanned };
  }
}

