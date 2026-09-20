import { Injectable, NotFoundException, UnauthorizedException, BadRequestException, ForbiddenException, Optional, OnModuleInit } from '@nestjs/common';
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
export class AdminService implements OnModuleInit {
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

  async onModuleInit() {
    await this.ensureIndexes();
  }

  private async ensureIndexes() {
    try {
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS idx_verification_logs_ip_created ON verification_logs(ip, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_verification_logs_site_ip_created ON verification_logs(site_id, ip, created_at DESC);
      `);
    } catch {}
  }

  private hashPassword(password: string): string {
    const salt = process.env.APP_SALT || process.env.JWT_SECRET || 'vina_captcha_salt_2026';
    return crypto.createHash('sha256').update(password.trim() + salt).digest('hex');
  }

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
        WITH day_series AS (
          SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - (n || ' days')::interval)::date AS date
          FROM generate_series(6, 0, -1) AS n
        )
        SELECT 
          TO_CHAR(ds.date, 'YYYY-MM-DD') AS date,
          COALESCE(SUM(CASE WHEN vl.result = 'pass' THEN 1 ELSE 0 END), 0)::int AS passed,
          COALESCE(SUM(CASE WHEN vl.result = 'fail' THEN 1 ELSE 0 END), 0)::int AS failed
        FROM day_series ds
        LEFT JOIN verification_logs vl 
          ON (vl.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ds.date
          AND vl.site_id IN (SELECT id FROM sites WHERE account_id = $1)
        GROUP BY ds.date
        ORDER BY ds.date ASC
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

      let riskTriggers: Array<{ key: string; label: string; count: number; percentage: number; color: string; icon: string }> = [];
      try {
        const triggersQuery = await this.dataSource.query(`
          SELECT 
            COUNT(*) as total_evaluated,
            SUM(CASE WHEN (vl.risk_breakdown->'isRateLimitExceeded')::boolean = true OR (vl.risk_breakdown->>'rateLimitScore')::int > 0 OR vl.risk_breakdown->'flags' ? 'RATE_LIMIT_5M_EXCEEDED' OR vl.risk_breakdown->'flags' ? 'RATE_LIMIT_10S_BURST' THEN 1 ELSE 0 END) as rate_limit_count,
            SUM(CASE WHEN (vl.risk_breakdown->'clientSignals'->>'webdriver')::boolean = true OR vl.risk_breakdown->'flags' ? 'WEBDRIVER_AUTOMATION' THEN 1 ELSE 0 END) as webdriver_count,
            SUM(CASE WHEN (vl.risk_breakdown->'clientSignals'->>'honeypot_filled')::boolean = true OR vl.risk_breakdown->'flags' ? 'HONEYPOT_FILLED' THEN 1 ELSE 0 END) as honeypot_count,
            SUM(CASE WHEN (vl.risk_breakdown->'clientSignals'->>'gpu_renderer') ILIKE '%swiftshader%' OR (vl.risk_breakdown->'clientSignals'->>'gpu_renderer') ILIKE '%llvmpipe%' OR (vl.risk_breakdown->'clientSignals'->>'gpu_renderer') ILIKE '%mesa%' OR (vl.risk_breakdown->'clientSignals'->>'gpu_renderer') ILIKE '%virtualbox%' OR (vl.risk_breakdown->'clientSignals'->>'gpu_renderer') ILIKE '%vmware%' OR vl.risk_breakdown->'flags' ? 'VIRTUAL_GPU_DETECTED' THEN 1 ELSE 0 END) as virtual_gpu_count,
            SUM(CASE WHEN vl.risk_breakdown->>'threatCategory' IS NOT NULL OR vl.risk_breakdown->'flags' ? 'THREAT_INTEL_ATTACK' OR vl.risk_breakdown->'flags' ? 'THREAT_INTEL_DATACENTER' THEN 1 ELSE 0 END) as threat_intel_count,
            SUM(CASE WHEN (vl.risk_breakdown->'clientSignals'->>'execution_count')::int > 1 AND (vl.risk_breakdown->'clientSignals'->>'mouse_moves')::int = 0 OR vl.risk_breakdown->'flags' ? 'REPEATED_SUBMIT_NO_MOTION' THEN 1 ELSE 0 END) as anti_automation_count,
            SUM(CASE WHEN (vl.risk_breakdown->>'isBannedIp')::boolean = true OR (vl.risk_breakdown->>'reputationScore')::int >= 35 OR vl.risk_breakdown->'flags' ? 'IP_REPUTATION_BANNED' THEN 1 ELSE 0 END) as ip_reputation_count
          FROM verification_logs vl
          JOIN sites s ON s.id = vl.site_id
          WHERE s.account_id = $1 AND vl.risk_breakdown IS NOT NULL
        `, [accountId]);

        if (triggersQuery && triggersQuery.length > 0) {
          const row = triggersQuery[0];
          const totalBot = (parseInt(row.rate_limit_count, 10) || 0) +
                           (parseInt(row.webdriver_count, 10) || 0) +
                           (parseInt(row.honeypot_count, 10) || 0) +
                           (parseInt(row.virtual_gpu_count, 10) || 0) +
                           (parseInt(row.threat_intel_count, 10) || 0) +
                           (parseInt(row.anti_automation_count, 10) || 0) +
                           (parseInt(row.ip_reputation_count, 10) || 0) || 1;

          const rawList = [
            { key: 'rate_limit', label: 'Tần Suất Quá Nhanh (Rate Limit 403)', count: parseInt(row.rate_limit_count, 10) || 0, color: '#ea5455', icon: 'ThunderboltOutlined' },
            { key: 'webdriver', label: 'Trình Duyệt Tự Động (Webdriver Bot)', count: parseInt(row.webdriver_count, 10) || 0, color: '#7367f0', icon: 'RobotOutlined' },
            { key: 'honeypot', label: 'Dính Bẫy Ẩn (Honeypot Triggered)', count: parseInt(row.honeypot_count, 10) || 0, color: '#e83e8c', icon: 'BugOutlined' },
            { key: 'virtual_gpu', label: 'GPU Máy Ảo (Headless Server)', count: parseInt(row.virtual_gpu_count, 10) || 0, color: '#ff9f43', icon: 'LaptopOutlined' },
            { key: 'threat_intel', label: 'Dải IP Độc Hại / Datacenter', count: parseInt(row.threat_intel_count, 10) || 0, color: '#00cfe8', icon: 'GlobalOutlined' },
            { key: 'anti_automation', label: 'Submit Lặp Không Tương Tác', count: parseInt(row.anti_automation_count, 10) || 0, color: '#28c76f', icon: 'ReloadOutlined' },
            { key: 'ip_reputation', label: 'IP Có Tiền Sử Vi Phạm', count: parseInt(row.ip_reputation_count, 10) || 0, color: '#fd7e14', icon: 'SafetyCertificateOutlined' },
          ];

          riskTriggers = rawList.map(item => ({
            ...item,
            percentage: Math.round((item.count / totalBot) * 100),
          })).filter(item => item.count > 0);
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
        riskTriggers,
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

    // Stats for Chart (grouped by date 7 ngày gần nhất tính đến hôm nay)
    const chartData = await this.dataSource.query(`
      WITH day_series AS (
        SELECT ((CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Ho_Chi_Minh')::date - (n || ' days')::interval)::date AS date
        FROM generate_series(6, 0, -1) AS n
      )
      SELECT 
        TO_CHAR(ds.date, 'YYYY-MM-DD') AS date,
        COALESCE(SUM(CASE WHEN vl.result = 'pass' THEN 1 ELSE 0 END), 0)::int AS passed,
        COALESCE(SUM(CASE WHEN vl.result = 'fail' THEN 1 ELSE 0 END), 0)::int AS failed
      FROM day_series ds
      LEFT JOIN verification_logs vl 
        ON (vl.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date = ds.date
      GROUP BY ds.date
      ORDER BY ds.date ASC
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

    let riskTriggers: Array<{ key: string; label: string; count: number; percentage: number; color: string; icon: string }> = [];
    try {
      const triggersQuery = await this.dataSource.query(`
        SELECT 
          COUNT(*) as total_evaluated,
          SUM(CASE WHEN (vl.risk_breakdown->'isRateLimitExceeded')::boolean = true OR (vl.risk_breakdown->>'rateLimitScore')::int > 0 OR vl.risk_breakdown->'flags' ? 'RATE_LIMIT_5M_EXCEEDED' OR vl.risk_breakdown->'flags' ? 'RATE_LIMIT_10S_BURST' THEN 1 ELSE 0 END) as rate_limit_count,
          SUM(CASE WHEN (vl.risk_breakdown->'clientSignals'->>'webdriver')::boolean = true OR vl.risk_breakdown->'flags' ? 'WEBDRIVER_AUTOMATION' THEN 1 ELSE 0 END) as webdriver_count,
          SUM(CASE WHEN (vl.risk_breakdown->'clientSignals'->>'honeypot_filled')::boolean = true OR vl.risk_breakdown->'flags' ? 'HONEYPOT_FILLED' THEN 1 ELSE 0 END) as honeypot_count,
          SUM(CASE WHEN (vl.risk_breakdown->'clientSignals'->>'gpu_renderer') ILIKE '%swiftshader%' OR (vl.risk_breakdown->'clientSignals'->>'gpu_renderer') ILIKE '%llvmpipe%' OR (vl.risk_breakdown->'clientSignals'->>'gpu_renderer') ILIKE '%mesa%' OR (vl.risk_breakdown->'clientSignals'->>'gpu_renderer') ILIKE '%virtualbox%' OR (vl.risk_breakdown->'clientSignals'->>'gpu_renderer') ILIKE '%vmware%' OR vl.risk_breakdown->'flags' ? 'VIRTUAL_GPU_DETECTED' THEN 1 ELSE 0 END) as virtual_gpu_count,
          SUM(CASE WHEN vl.risk_breakdown->>'threatCategory' IS NOT NULL OR vl.risk_breakdown->'flags' ? 'THREAT_INTEL_ATTACK' OR vl.risk_breakdown->'flags' ? 'THREAT_INTEL_DATACENTER' THEN 1 ELSE 0 END) as threat_intel_count,
          SUM(CASE WHEN (vl.risk_breakdown->'clientSignals'->>'execution_count')::int > 1 AND (vl.risk_breakdown->'clientSignals'->>'mouse_moves')::int = 0 OR vl.risk_breakdown->'flags' ? 'REPEATED_SUBMIT_NO_MOTION' THEN 1 ELSE 0 END) as anti_automation_count,
          SUM(CASE WHEN (vl.risk_breakdown->>'isBannedIp')::boolean = true OR (vl.risk_breakdown->>'reputationScore')::int >= 35 OR vl.risk_breakdown->'flags' ? 'IP_REPUTATION_BANNED' THEN 1 ELSE 0 END) as ip_reputation_count
        FROM verification_logs vl
        WHERE vl.risk_breakdown IS NOT NULL
      `);

      if (triggersQuery && triggersQuery.length > 0) {
        const row = triggersQuery[0];
        const totalBot = (parseInt(row.rate_limit_count, 10) || 0) +
                         (parseInt(row.webdriver_count, 10) || 0) +
                         (parseInt(row.honeypot_count, 10) || 0) +
                         (parseInt(row.virtual_gpu_count, 10) || 0) +
                         (parseInt(row.threat_intel_count, 10) || 0) +
                         (parseInt(row.anti_automation_count, 10) || 0) +
                         (parseInt(row.ip_reputation_count, 10) || 0) || 1;

        const rawList = [
          { key: 'rate_limit', label: 'Tần Suất Quá Nhanh (Rate Limit 403)', count: parseInt(row.rate_limit_count, 10) || 0, color: '#ea5455', icon: 'ThunderboltOutlined' },
          { key: 'webdriver', label: 'Trình Duyệt Tự Động (Webdriver Bot)', count: parseInt(row.webdriver_count, 10) || 0, color: '#7367f0', icon: 'RobotOutlined' },
          { key: 'honeypot', label: 'Dính Bẫy Ẩn (Honeypot Triggered)', count: parseInt(row.honeypot_count, 10) || 0, color: '#e83e8c', icon: 'BugOutlined' },
          { key: 'virtual_gpu', label: 'GPU Máy Ảo (Headless Server)', count: parseInt(row.virtual_gpu_count, 10) || 0, color: '#ff9f43', icon: 'LaptopOutlined' },
          { key: 'threat_intel', label: 'Dải IP Độc Hại / Datacenter', count: parseInt(row.threat_intel_count, 10) || 0, color: '#00cfe8', icon: 'GlobalOutlined' },
          { key: 'anti_automation', label: 'Submit Lặp Không Tương Tác', count: parseInt(row.anti_automation_count, 10) || 0, color: '#28c76f', icon: 'ReloadOutlined' },
          { key: 'ip_reputation', label: 'IP Có Tiền Sử Vi Phạm', count: parseInt(row.ip_reputation_count, 10) || 0, color: '#fd7e14', icon: 'SafetyCertificateOutlined' },
        ];

        riskTriggers = rawList.map(item => ({
          ...item,
          percentage: Math.round((item.count / totalBot) * 100),
        })).filter(item => item.count > 0);
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
      riskTriggers,
      last_synced_at: new Date().toISOString(),
    };

    // Lưu vào Redis cache với TTL 3s (đảm bảo tính realtime cho chu kỳ polling 5s)
    await this.redisService.setDashboardStatsCache(result, 3);

    return result;
  }

  // ─── TRUY VẤN LỊCH SỬ VERIFY THEO IP & THỜI GIAN (TỐI ƯU HIỆU NĂNG) ────────

  async getVerificationLogs(
    params: {
      ip?: string;
      startDate?: string;
      endDate?: string;
      result?: string;
      siteId?: string;
      riskFactor?: string;
      page?: number | string;
      limit?: number | string;
    },
    accountId?: string,
    role?: string,
  ) {
    const pageNum = Math.max(1, parseInt(String(params.page || 1), 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(String(params.limit || 20), 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const whereConditions: string[] = ['1=1'];
    const queryParams: any[] = [];
    let pIdx = 1;

    // 1. Phân quyền theo account
    if (role !== 'admin' && accountId) {
      whereConditions.push(`s.account_id = $${pIdx++}`);
      queryParams.push(accountId);
    }

    // 2. Lọc theo siteId cụ thể
    if (params.siteId && params.siteId.trim()) {
      whereConditions.push(`vl.site_id = $${pIdx++}`);
      queryParams.push(params.siteId.trim());
    }

    // 3. Lọc theo IP (tận dụng B-Tree Index trên ip)
    const cleanIp = params.ip?.trim();
    if (cleanIp) {
      if (/^[0-9a-fA-F:.]+$/.test(cleanIp) && !cleanIp.includes('%')) {
        whereConditions.push(`(vl.ip = $${pIdx++}::inet OR vl.ip::text ILIKE $${pIdx++})`);
        queryParams.push(cleanIp, `${cleanIp}%`);
      } else {
        whereConditions.push(`vl.ip::text ILIKE $${pIdx++}`);
        queryParams.push(`%${cleanIp}%`);
      }
    }

    // 4. Lọc theo khoảng thời gian (kích hoạt Partition Pruning)
    if (params.startDate && params.startDate.trim()) {
      whereConditions.push(`vl.created_at >= $${pIdx++}`);
      queryParams.push(new Date(params.startDate).toISOString());
    }
    if (params.endDate && params.endDate.trim()) {
      whereConditions.push(`vl.created_at <= $${pIdx++}`);
      queryParams.push(new Date(params.endDate).toISOString());
    }

    // 5. Lọc theo kết quả pass / fail
    if (params.result && (params.result === 'pass' || params.result === 'fail')) {
      whereConditions.push(`vl.result = $${pIdx++}`);
      queryParams.push(params.result);
    }

    // 6. Lọc theo tác nhân rủi ro (riskFactor)
    if (params.riskFactor && params.riskFactor !== 'all') {
      const rf = params.riskFactor;
      if (rf === 'rate_limit') {
        whereConditions.push(`((vl.risk_breakdown->'isRateLimitExceeded')::boolean = true OR (vl.risk_breakdown->>'rateLimitScore')::int > 0 OR vl.risk_breakdown->'flags' ? 'RATE_LIMIT_5M_EXCEEDED' OR vl.risk_breakdown->'flags' ? 'RATE_LIMIT_10S_BURST' OR vl.risk_breakdown->'flags' ? 'RATE_LIMIT_1H_FLOOD')`);
      } else if (rf === 'webdriver') {
        whereConditions.push(`((vl.risk_breakdown->'clientSignals'->>'webdriver')::boolean = true OR vl.risk_breakdown->'flags' ? 'WEBDRIVER_AUTOMATION')`);
      } else if (rf === 'honeypot') {
        whereConditions.push(`((vl.risk_breakdown->'clientSignals'->>'honeypot_filled')::boolean = true OR vl.risk_breakdown->'flags' ? 'HONEYPOT_FILLED')`);
      } else if (rf === 'virtual_gpu') {
        whereConditions.push(`((vl.risk_breakdown->'clientSignals'->>'gpu_renderer') ILIKE '%swiftshader%' OR (vl.risk_breakdown->'clientSignals'->>'gpu_renderer') ILIKE '%llvmpipe%' OR (vl.risk_breakdown->'clientSignals'->>'gpu_renderer') ILIKE '%mesa%' OR (vl.risk_breakdown->'clientSignals'->>'gpu_renderer') ILIKE '%virtualbox%' OR (vl.risk_breakdown->'clientSignals'->>'gpu_renderer') ILIKE '%vmware%' OR vl.risk_breakdown->'flags' ? 'VIRTUAL_GPU_DETECTED')`);
      } else if (rf === 'threat_intel') {
        whereConditions.push(`(vl.risk_breakdown->>'threatCategory' IS NOT NULL OR vl.risk_breakdown->'flags' ? 'THREAT_INTEL_ATTACK' OR vl.risk_breakdown->'flags' ? 'THREAT_INTEL_DATACENTER')`);
      } else if (rf === 'anti_automation') {
        whereConditions.push(`(((vl.risk_breakdown->'clientSignals'->>'execution_count')::int > 1 AND (vl.risk_breakdown->'clientSignals'->>'mouse_moves')::int = 0) OR vl.risk_breakdown->'flags' ? 'REPEATED_SUBMIT_NO_MOTION' OR vl.risk_breakdown->'flags' ? 'REPEATED_SUBMIT_RAPID')`);
      } else if (rf === 'utm') {
        whereConditions.push(`(vl.risk_breakdown->'clientSignals'->>'utm_campaign' IS NOT NULL)`);
      } else if (rf === 'banned_ip') {
        whereConditions.push(`((vl.risk_breakdown->>'isBannedIp')::boolean = true OR vl.risk_breakdown->'flags' ? 'IP_REPUTATION_BANNED')`);
      }
    }

    const whereClause = whereConditions.join(' AND ');

    // Query 1: Lấy danh sách logs kèm site info (sử dụng Index Scan O(log N))
    const listQuery = `
      SELECT 
        vl.id,
        vl.ip,
        vl.challenge_type,
        vl.result,
        vl.risk_score,
        vl.risk_breakdown,
        vl.created_at,
        s.primary_domain AS site_domain
      FROM verification_logs vl
      LEFT JOIN sites s ON s.id = vl.site_id
      WHERE ${whereClause}
      ORDER BY vl.created_at DESC
      LIMIT $${pIdx++} OFFSET $${pIdx++}
    `;
    const listParams = [...queryParams, limitNum, offset];

    // Query 2: Single-pass aggregation cho tổng bản ghi & IP summary
    const countQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN vl.result = 'pass' THEN 1 ELSE 0 END) as pass_count,
        SUM(CASE WHEN vl.result = 'fail' THEN 1 ELSE 0 END) as fail_count,
        ROUND(AVG(COALESCE(vl.risk_score, 0)), 1) as avg_risk_score,
        MIN(vl.created_at) as first_seen,
        MAX(vl.created_at) as last_seen
      FROM verification_logs vl
      LEFT JOIN sites s ON s.id = vl.site_id
      WHERE ${whereClause}
    `;

    const [rows, countRes] = await Promise.all([
      this.dataSource.query(listQuery, listParams),
      this.dataSource.query(countQuery, queryParams),
    ]);

    const total = parseInt(countRes[0]?.total || '0', 10);
    const passCount = parseInt(countRes[0]?.pass_count || '0', 10);
    const failCount = parseInt(countRes[0]?.fail_count || '0', 10);
    const avgRiskScore = parseFloat(countRes[0]?.avg_risk_score) || 0;
    const firstSeen = countRes[0]?.first_seen || null;
    const lastSeen = countRes[0]?.last_seen || null;

    let ipSummary = null;
    if (cleanIp && total > 0) {
      ipSummary = {
        ip: cleanIp,
        totalCount: total,
        passCount,
        failCount,
        avgRiskScore,
        firstSeen,
        lastSeen,
      };
    }

    return {
      data: rows || [],
      total,
      page: pageNum,
      limit: limitNum,
      ipSummary,
    };
  }

  // ─── TRA CỨU CHI TIẾT THÔNG TIN IP (IP INTELLIGENCE DETAIL) ─────────────────

  async getIpIntelligence(ip: string, accountId?: string, role?: string) {
    const cleanIp = (ip || '').trim();
    if (!cleanIp) {
      throw new BadRequestException('IP không hợp lệ');
    }

    const isPrivate = /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|::1|localhost)/i.test(cleanIp);

    // 1. Lấy thông tin GeoIP (từ Redis Cache hoặc Free API ip-api.com)
    const cacheKey = `ip_intel:${cleanIp}`;
    let geoData: any = null;

    if (!isPrivate) {
      try {
        const cached = await this.redisService.getClient().get(cacheKey);
        if (cached) {
          geoData = JSON.parse(cached);
        }
      } catch {}

      if (!geoData) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 3000);
          const res = await fetch(
            `http://ip-api.com/json/${cleanIp}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,mobile,proxy,hosting,query`,
            { signal: controller.signal }
          );
          clearTimeout(timeoutId);
          if (res.ok) {
            const json: any = await res.json();
            if (json.status === 'success') {
              geoData = {
                country: json.country || 'Unknown',
                countryCode: json.countryCode || '',
                region: json.regionName || json.region || '',
                city: json.city || '',
                zip: json.zip || '',
                lat: json.lat || 0,
                lon: json.lon || 0,
                timezone: json.timezone || '',
                isp: json.isp || '',
                org: json.org || '',
                as: json.as || '',
                is_mobile: Boolean(json.mobile),
                is_proxy: Boolean(json.proxy),
                is_hosting: Boolean(json.hosting),
              };
              // Cache 24 giờ (86400s)
              await this.redisService.getClient().setex(cacheKey, 86400, JSON.stringify(geoData));
            }
          }
        } catch {
          geoData = {
            country: 'Unknown',
            countryCode: '',
            region: '',
            city: '',
            isp: 'Không thể tra cứu Geolocation',
            org: '',
            as: '',
            is_mobile: false,
            is_proxy: false,
            is_hosting: false,
          };
        }
      }
    } else {
      geoData = {
        country: 'Local Network',
        countryCode: 'LAN',
        region: 'Internal',
        city: 'Localhost',
        isp: 'Private / Localhost',
        org: 'Internal Network',
        as: 'Local Loopback',
        is_mobile: false,
        is_proxy: false,
        is_hosting: false,
      };
    }

    // 2. Tra cứu Threat Intel nội bộ (threat_intel_ranges)
    let threatIntel: any = { is_matched: false, category: null, source: null, cidr: null };
    if (!isPrivate) {
      try {
        const threatRows = await this.dataSource.query(
          `SELECT source, category, cidr::text as cidr FROM threat_intel_ranges WHERE cidr >>= $1::inet LIMIT 1`,
          [cleanIp]
        );
        if (threatRows && threatRows.length > 0) {
          threatIntel = {
            is_matched: true,
            category: threatRows[0].category,
            source: threatRows[0].source,
            cidr: threatRows[0].cidr,
          };
        }
      } catch {}
    }

    // 3. Tra cứu IP Reputation nội bộ (ip_reputation)
    let reputation: any = {
      is_banned: false,
      fail_count: 0,
      site_count_seen: 1,
      first_seen_at: null,
      last_seen_at: null,
    };
    try {
      const repRows = await this.dataSource.query(
        `SELECT fail_count, site_count_seen, first_seen_at, last_seen_at FROM ip_reputation WHERE ip_cidr >>= $1::inet LIMIT 1`,
        [cleanIp]
      );
      if (repRows && repRows.length > 0) {
        reputation = {
          is_banned: repRows[0].fail_count > 10,
          fail_count: repRows[0].fail_count || 0,
          site_count_seen: repRows[0].site_count_seen || 1,
          first_seen_at: repRows[0].first_seen_at,
          last_seen_at: repRows[0].last_seen_at,
        };
      }
    } catch {}

    // 4. Thống kê thực tế từ verification_logs của IP này
    let verificationStats: any = {
      total_requests: 0,
      pass_count: 0,
      fail_count: 0,
      avg_risk_score: 0,
      first_seen: null,
      last_seen: null,
      visited_sites: [],
    };
    try {
      const logWhere = ['vl.ip = $1::inet'];
      const logParams: any[] = [cleanIp];
      if (role !== 'admin' && accountId) {
        logWhere.push('s.account_id = $2');
        logParams.push(accountId);
      }
      const whereStr = logWhere.join(' AND ');

      const statsRows = await this.dataSource.query(
        `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN vl.result = 'pass' THEN 1 ELSE 0 END) as pass_count,
          SUM(CASE WHEN vl.result = 'fail' THEN 1 ELSE 0 END) as fail_count,
          ROUND(AVG(COALESCE(vl.risk_score, 0)), 1) as avg_risk_score,
          MIN(vl.created_at) as first_seen,
          MAX(vl.created_at) as last_seen,
          ARRAY_AGG(DISTINCT s.primary_domain) FILTER (WHERE s.primary_domain IS NOT NULL) as sites
        FROM verification_logs vl
        LEFT JOIN sites s ON s.id = vl.site_id
        WHERE ${whereStr}
        `,
        logParams
      );

      if (statsRows && statsRows.length > 0) {
        verificationStats = {
          total_requests: parseInt(statsRows[0].total || '0', 10),
          pass_count: parseInt(statsRows[0].pass_count || '0', 10),
          fail_count: parseInt(statsRows[0].fail_count || '0', 10),
          avg_risk_score: parseFloat(statsRows[0].avg_risk_score) || 0,
          first_seen: statsRows[0].first_seen,
          last_seen: statsRows[0].last_seen,
          visited_sites: (statsRows[0].sites || []).filter(Boolean),
        };
      }
    } catch {}

    return {
      ip: cleanIp,
      is_private: isPrivate,
      geo: geoData,
      threat_intel: threatIntel,
      reputation,
      verification_stats: verificationStats,
    };
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
    const passwordHash = this.hashPassword(body.admin_password);

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

    const passwordHash = this.hashPassword(password);
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

  async forgotPassword(email: string, requestBaseUrl?: string, captchaToken?: string) {
    await this.verifyAuthCaptcha(captchaToken);

    const cleanEmail = email?.trim().toLowerCase();
    if (!cleanEmail) {
      throw new BadRequestException('Email là bắt buộc');
    }

    const acc = await this.accountsRepo.findOneBy({ email: cleanEmail });
    if (acc && acc.status === 'active') {
      const resetToken = crypto.randomBytes(32).toString('hex');
      // TTL 15 phút (900s), lưu trữ one-time token vào Redis
      await this.redisService.setOneTimeToken(`pwd_reset:${resetToken}`, 900, acc.id);

      // Gửi email đặt lại mật khẩu
      await this.mailService.sendPasswordResetEmail(acc.email, acc.name, resetToken, requestBaseUrl);
    }

    // Luôn trả về thông báo chung để ngăn chặn dò quét email (email enumeration attack)
    return {
      success: true,
      message: 'Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi đến hòm thư của bạn.',
    };
  }

  async resetPassword(token: string, password: string, captchaToken?: string) {
    await this.verifyAuthCaptcha(captchaToken);

    if (!token || typeof token !== 'string' || !token.trim()) {
      throw new BadRequestException('Thiếu mã xác thực đặt lại mật khẩu');
    }

    if (!password || typeof password !== 'string' || password.trim().length < 6) {
      throw new BadRequestException('Mật khẩu mới phải có ít nhất 6 ký tự');
    }

    const cleanToken = token.trim();
    // Tiêu thụ one-time token từ Redis
    const accountId = await this.redisService.useOneTimeToken(`pwd_reset:${cleanToken}`);
    if (!accountId) {
      throw new BadRequestException('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Vui lòng gửi lại yêu cầu.');
    }

    const acc = await this.accountsRepo.findOneBy({ id: accountId });
    if (!acc) {
      throw new BadRequestException('Tài khoản không tồn tại.');
    }

    acc.password_hash = this.hashPassword(password);
    await this.accountsRepo.save(acc);

    return {
      success: true,
      message: 'Mật khẩu của bạn đã được cập nhật thành công. Vui lòng đăng nhập với mật khẩu mới.',
    };
  }

  async login(email: string, password: string, captchaToken?: string) {
    await this.verifyAuthCaptcha(captchaToken);

    const cleanEmail = email?.trim().toLowerCase();
    const acc = await this.accountsRepo.findOneBy({ email: cleanEmail });
    if (!acc) {
      throw new UnauthorizedException('Email hoặc mật khẩu không chính xác');
    }

    const passwordHash = this.hashPassword(password);

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
      acc.password_hash = this.hashPassword(body.password);
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

  async getIpReputation(start: number, end: number, q?: string, status?: string, res?: any) {
    const limit = Math.max(1, end - start);
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (q && q.trim().length > 0) {
      const cleanQ = q.trim();
      conditions.push(`(ip_cidr::text ILIKE $${paramIndex})`);
      params.push(`%${cleanQ}%`);
      paramIndex++;
    }

    if (status && status !== 'all') {
      if (status === 'banned') {
        conditions.push(`fail_count > 10`);
      } else if (status === 'warning') {
        conditions.push(`fail_count >= 2 AND fail_count <= 10`);
      } else if (status === 'active') {
        conditions.push(`fail_count < 2`);
      }
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const queryParams = [...params, limit, start];
    const limitOffsetClause = `LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;

    const [rows, countRes] = await Promise.all([
      this.dataSource.query(
        `SELECT ip_cidr::text as ip_cidr, fail_count, site_count_seen, first_seen_at, last_seen_at, updated_at
         FROM ip_reputation
         ${whereClause}
         ORDER BY fail_count DESC, last_seen_at DESC
         ${limitOffsetClause}`,
        queryParams,
      ),
      this.dataSource.query(
        `SELECT COUNT(*) as count FROM ip_reputation ${whereClause}`,
        params,
      ),
    ]);

    const total = parseInt(countRes[0]?.count || '0', 10);
    res?.header?.('X-Total-Count', total.toString());
    res?.header?.('Access-Control-Expose-Headers', 'X-Total-Count');

    const data = rows.map((r: any) => {
      const failCount = parseInt(r.fail_count, 10) || 0;
      const isBanned = failCount > 10;
      const riskLevel = isBanned ? 'banned' : failCount >= 5 ? 'high' : failCount >= 2 ? 'medium' : 'low';
      return {
        id: r.ip_cidr,      // Refine cần trường `id` cho row key
        ip_cidr: r.ip_cidr,
        fail_count: failCount,
        site_count_seen: parseInt(r.site_count_seen, 10) || 1,
        is_banned: isBanned,
        risk_level: riskLevel,
        first_seen_at: r.first_seen_at,
        last_seen_at: r.last_seen_at,
        updated_at: r.updated_at,
      };
    });

    return data;
  }

  async getIpReputationStats() {
    const stats = await this.dataSource.query(`
      SELECT 
        COUNT(*) as total_ips,
        SUM(CASE WHEN fail_count > 10 THEN 1 ELSE 0 END) as banned_count,
        SUM(CASE WHEN fail_count >= 2 AND fail_count <= 10 THEN 1 ELSE 0 END) as warning_count,
        SUM(CASE WHEN site_count_seen >= 2 THEN 1 ELSE 0 END) as multi_site_count
      FROM ip_reputation
    `);

    const row = stats[0] || {};
    return {
      total_ips: parseInt(row.total_ips, 10) || 0,
      banned_count: parseInt(row.banned_count, 10) || 0,
      warning_count: parseInt(row.warning_count, 10) || 0,
      multi_site_count: parseInt(row.multi_site_count, 10) || 0,
    };
  }

  async addOrUpdateIpReputation(body: { ip: string; fail_count?: number; is_banned?: boolean; reason?: string }) {
    if (!body?.ip || typeof body.ip !== 'string') {
      throw new BadRequestException('Địa chỉ IP / CIDR không hợp lệ');
    }

    const cleanIp = body.ip.trim();
    // Validate IPv4 or CIDR format or IPv6
    const ipCidrRegex = /^((25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)(\/([0-9]|[1-2][0-9]|3[0-2]))?$/;
    const isIpv6 = cleanIp.includes(':');
    if (!ipCidrRegex.test(cleanIp) && !isIpv6) {
      throw new BadRequestException('Định dạng địa chỉ IP hoặc CIDR không hợp lệ (VD: 1.2.3.4 hoặc 10.0.0.0/24)');
    }

    const isBanned = body.is_banned ?? true;
    const failCount = body.fail_count !== undefined ? Math.max(0, parseInt(body.fail_count as any, 10) || 0) : (isBanned ? 11 : 5);

    try {
      await this.dataSource.query(`
        INSERT INTO ip_reputation (ip_cidr, fail_count, site_count_seen, first_seen_at, last_seen_at, updated_at)
        VALUES (
          CASE 
            WHEN $1 ~ '/' THEN $1::cidr 
            ELSE set_masklen($1::inet, 32)::cidr 
          END, 
          $2, 
          1, 
          NOW(), 
          NOW(), 
          NOW()
        )
        ON CONFLICT (ip_cidr) DO UPDATE 
        SET fail_count = EXCLUDED.fail_count,
            last_seen_at = NOW(),
            updated_at = NOW()
      `, [cleanIp, failCount]);

      return {
        success: true,
        ip: cleanIp,
        fail_count: failCount,
        is_banned: failCount > 10,
        message: `Đã ${failCount > 10 ? 'cấm' : 'lưu'} IP ${cleanIp} thành công`,
      };
    } catch (err: any) {
      throw new BadRequestException(`Lỗi khi lưu IP ${cleanIp}: ${err.message}`);
    }
  }

  async setIpBanStatus(ip: string, isBanned: boolean) {
    if (!ip) throw new BadRequestException('Thiếu địa chỉ IP');
    const cleanIp = ip.trim();
    const failCount = isBanned ? 11 : 0;
    
    try {
      await this.dataSource.query(`
        INSERT INTO ip_reputation (ip_cidr, fail_count, site_count_seen, first_seen_at, last_seen_at, updated_at)
        VALUES (
          CASE 
            WHEN $1 ~ '/' THEN $1::cidr 
            ELSE set_masklen($1::inet, 32)::cidr 
          END, 
          $2, 
          1, 
          NOW(), 
          NOW(), 
          NOW()
        )
        ON CONFLICT (ip_cidr) DO UPDATE 
        SET fail_count = EXCLUDED.fail_count,
            last_seen_at = NOW(),
            updated_at = NOW()
      `, [cleanIp, failCount]);

      return { success: true, ip: cleanIp, is_banned: isBanned, fail_count: failCount };
    } catch (err: any) {
      throw new BadRequestException(`Lỗi khi cập nhật IP ${cleanIp}: ${err.message}`);
    }
  }

  async deleteIpReputation(ip: string) {
    if (!ip) throw new BadRequestException('Thiếu địa chỉ IP');
    const cleanIp = ip.trim();

    try {
      await this.dataSource.query(`
        DELETE FROM ip_reputation 
        WHERE ip_cidr = (
          CASE 
            WHEN $1 ~ '/' THEN $1::cidr 
            ELSE set_masklen($1::inet, 32)::cidr 
          END
        )
      `, [cleanIp]);

      await this.dataSource.query(`
        DELETE FROM ip_reputation_sightings 
        WHERE ip_cidr = (
          CASE 
            WHEN $1 ~ '/' THEN $1::cidr 
            ELSE set_masklen($1::inet, 32)::cidr 
          END
        )
      `, [cleanIp]).catch(() => {});

      return { success: true, ip: cleanIp, message: `Đã xóa IP ${cleanIp} khỏi danh sách theo dõi` };
    } catch (err: any) {
      throw new BadRequestException(`Lỗi khi xóa IP ${cleanIp}: ${err.message}`);
    }
  }
}

