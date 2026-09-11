import { Controller, Get, Post, Patch, Delete, Param, Body, Query, Res, Req, BadRequestException, Headers, Header, UseGuards } from '@nestjs/common';

import { AdminService } from './admin.service.js';
import { ThreatIntelService } from '../threat-intel/threat-intel.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';

@Controller('admin/v1')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly threatIntelService: ThreatIntelService,
  ) {}

  // ─── Endpoint công khai (không cần JWT) ────────────────────────────────────

  @Get('setup/status')
  async getSetupStatus() {
    return this.adminService.getSetupStatus();
  }

  @Post('setup')
  async runSetup(@Body() body: any) {
    return this.adminService.runSetup(body);
  }

  @Post('auth/login')
  async login(@Body() body: any) {
    if (!body?.email || !body?.password) {
      throw new BadRequestException('Email và mật khẩu là bắt buộc');
    }
    return this.adminService.login(body.email, body.password);
  }

  @Post('auth/register')
  async register(@Body() body: any) {
    if (!body?.email || !body?.password || !body?.name) {
      throw new BadRequestException('Email, mật khẩu và tên là bắt buộc');
    }
    return this.adminService.register(body.email, body.password, body.name);
  }

  @Get('auth/activate')
  async activate(@Query('token') token: string, @Res() res: any) {
    if (!token) {
      throw new BadRequestException('Thiếu token kích hoạt');
    }
    await this.adminService.activateAccount(token);
    const dashboardUrl = process.env.DASHBOARD_URL || process.env.APP_URL || '';
    const redirectUrl = dashboardUrl ? `${dashboardUrl}/login?activated=true` : '/login?activated=true';
    return res.redirect(redirectUrl);
  }

  // ─── Endpoint bảo vệ bằng JWT (tất cả endpoint còn lại) ───────────────────

  @UseGuards(JwtAuthGuard)
  @Post('auth/refresh')
  async refresh() {
    return { message: 'Use /auth/login to get a new token' };
  }

  @UseGuards(JwtAuthGuard)
  @Get('auth/me')
  async me(@Req() req: any) {
    return this.adminService.getAccountById(req.account?.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('dashboard/stats')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  @Header('Pragma', 'no-cache')
  @Header('Expires', '0')
  async getDashboardStats(@Req() req: any) {
    return this.adminService.getDashboardStats(req.account?.id, req.account?.role);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sites')
  async getSites(
    @Req() req: any,
    @Query('_start') start = '0',
    @Query('_end') end = '10',
    @Res({ passthrough: true }) res: any
  ) {
    const startNum = parseInt(start) || 0;
    const endNum = parseInt(end) || 10;
    const limit = Math.max(1, endNum - startNum);
    const page = Math.floor(startNum / limit) + 1;
    const { data, total } = await this.adminService.getSites(page, limit, req.account?.id, req.account?.role);
    res.header('Access-Control-Expose-Headers', 'X-Total-Count');
    res.header('X-Total-Count', total.toString());
    return data;
  }

  @UseGuards(JwtAuthGuard)
  @Get('sites/:id')
  async getSite(@Req() req: any, @Param('id') id: string) {
    return this.adminService.getSiteById(id, req.account?.id, req.account?.role);
  }

  @UseGuards(JwtAuthGuard)
  @Post('sites')
  async createSite(@Req() req: any, @Body() body: any) {
    return this.adminService.createSite(req.account?.id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('sites/:id')
  async updateSite(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.adminService.updateSite(id, body, req.account?.id, req.account?.role);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sites/:id')
  async deleteSite(@Req() req: any, @Param('id') id: string) {
    return this.adminService.deleteSite(id, req.account?.id, req.account?.role);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sites/:siteId/api-keys')
  async getApiKeys(
    @Req() req: any,
    @Param('siteId') siteId: string,
    @Res({ passthrough: true }) res: any
  ) {
    const { data, total } = await this.adminService.getApiKeys(siteId, req.account?.id, req.account?.role);
    res.header('Access-Control-Expose-Headers', 'X-Total-Count');
    res.header('X-Total-Count', total.toString());
    return data;
  }

  @UseGuards(JwtAuthGuard)
  @Post('sites/:siteId/api-keys')
  async createApiKey(@Req() req: any, @Param('siteId') siteId: string, @Body() body: any) {
    return this.adminService.createApiKey(siteId, body.label, req.account?.id, req.account?.role);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('sites/:siteId/api-keys/:keyId')
  async revokeApiKey(@Req() req: any, @Param('siteId') siteId: string, @Param('keyId') keyId: string) {
    return this.adminService.revokeApiKey(siteId, keyId, req.account?.id, req.account?.role);
  }

  // THREAT INTEL — Danh sách & Quản lý nguồn dữ liệu IP nguy hiểm
  @UseGuards(JwtAuthGuard)
  @Get('threat-intel')
  @Header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
  async getThreatIntel(
    @Query('_start') start = '0',
    @Query('_end') end = '20',
    @Query('source') source?: string,
    @Res({ passthrough: true }) res?: any,
  ) {
    return this.adminService.getThreatIntel(
      parseInt(start) || 0,
      parseInt(end) || 20,
      source,
      res,
    );
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('threat-intel/sync')
  async syncThreatIntel(@Body() body: any) {
    const source = body?.source;
    if (source) {
      const result = await this.threatIntelService.syncSource(source);
      return { success: true, source, synced: result.synced };
    }
    const results = await this.threatIntelService.syncAllSources();
    const total = Object.values(results).reduce((s, v) => s + v, 0);
    return { success: true, sources: results, totalSynced: total };
  }

  // IP REPUTATION — Quản lý IP bị flag/banned
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('ip-reputation')
  @Header('Cache-Control', 'no-store, no-cache')
  async getIpReputation(
    @Query('_start') startParam?: string,
    @Query('_end') endParam?: string,
    @Query('pageSize') pageSize?: string,
    @Query('currentPage') currentPage?: string,
    @Res({ passthrough: true }) res?: any,
  ) {
    // Refine simple-rest gửi _start/_end (offset-based)
    // Refine có thể gửi pageSize/currentPage tuỳ version
    let start = 0;
    let end = 20;
    if (startParam !== undefined) {
      start = parseInt(startParam) || 0;
      end = parseInt(endParam || '20') || 20;
    } else if (pageSize && currentPage) {
      const ps = parseInt(pageSize) || 10;
      const cp = parseInt(currentPage) || 1;
      start = (cp - 1) * ps;
      end = start + ps;
    }
    return this.adminService.getIpReputation(start, end, res);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('ip-reputation/:ip/ban')
  async banIp(@Param('ip') ip: string) {
    return this.adminService.setIpBanStatus(ip, true);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('ip-reputation/:ip/unban')
  async unbanIp(@Param('ip') ip: string) {
    return this.adminService.setIpBanStatus(ip, false);
  }

  // ─── Quản lý Quota (Người dùng hiện tại) ───────────────────────────────────

  @UseGuards(JwtAuthGuard)
  @Get('accounts/quota-status')
  async getQuotaStatus(@Req() req: any) {
    return this.adminService.getAccountQuotaStatus(req.account?.id);
  }

  // ─── Quản lý Account & Plan (Chỉ Admin) ────────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('accounts')
  async getAccounts(
    @Query('_start') startParam?: string,
    @Query('_end') endParam?: string,
    @Query('pageSize') pageSize?: string,
    @Query('currentPage') currentPage?: string,
    @Res({ passthrough: true }) res?: any,
  ) {
    let start = 0;
    let end = 20;
    if (startParam !== undefined) {
      start = parseInt(startParam) || 0;
      end = parseInt(endParam || '20') || 20;
    } else if (pageSize && currentPage) {
      const ps = parseInt(pageSize) || 10;
      const cp = parseInt(currentPage) || 1;
      start = (cp - 1) * ps;
      end = start + ps;
    }
    return this.adminService.getAccounts(start, end, res);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('accounts/:id')
  async getAccountById(@Param('id') id: string) {
    return this.adminService.getAccountById(id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Patch('accounts/:id')
  async updateAccount(@Param('id') id: string, @Body() body: any) {
    return this.adminService.updateAccount(id, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('plans')
  async getPlans() {
    return this.adminService.getPlans();
  }

  // ─── Quản lý & Kiểm tra Cổng Email SMTP ───────────────────────────────────

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Get('smtp/status')
  async getSmtpStatus() {
    return this.adminService.getSmtpStatus();
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('smtp/config')
  async saveSmtpConfig(@Body() body: any) {
    return this.adminService.saveSmtpConfig(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Post('smtp/test')
  async testSmtp(@Body() body: { email?: string; config?: any }) {
    return this.adminService.testSmtpConnection(body?.email, body?.config);
  }
}


