import { Injectable, ForbiddenException, UnauthorizedException, HttpException, HttpStatus } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { IssueTokenDto } from './dto/issue.dto.js';
import { RedisService } from '../redis/redis.service.js';
import { RiskEngineService } from '../risk-engine/risk-engine.service.js';
import { DataSource } from 'typeorm';

@Injectable()
export class IssueService {
  constructor(
    private readonly redisService: RedisService,
    private readonly riskEngineService: RiskEngineService,
    private readonly dataSource: DataSource,
  ) {}

  async issueToken(apiKey: string, dto: IssueTokenDto, clientIp: string) {
    // 1. Lấy thông tin API Key, Site, Account & Plan (Ưu tiên từ Redis cache O(1))
    let metadata = await this.redisService.getApiKeyMetadataCache(apiKey);

    if (!metadata) {
      const apiKeyRes = await this.dataSource.query(
        `
        SELECT 
          k.id as key_id, 
          k.site_id, 
          k.revoked_at,
          s.account_id,
          s.platform,
          s.primary_domain,
          s.allowed_domains,
          COALESCE(s.challenge_mode, 'auto') as challenge_mode,
          COALESCE(p.max_requests, 10000) as max_requests
        FROM api_keys k
        JOIN sites s ON s.id = k.site_id
        JOIN accounts a ON a.id = s.account_id
        LEFT JOIN plans p ON p.id = a.plan_id
        WHERE k.key_prefix = $1
        `,
        [apiKey],
      );

      if (!apiKeyRes || apiKeyRes.length === 0 || apiKeyRes[0].revoked_at !== null) {
        throw new UnauthorizedException({
          error: { code: 'invalid_api_key', message: 'API key không hợp lệ hoặc đã bị vô hiệu hóa' },
        });
      }

      metadata = apiKeyRes[0];
      // Cache metadata 5 phút vào Redis để giải phóng hoàn toàn truy vấn Postgres cho các request sau
      await this.redisService.setApiKeyMetadataCache(apiKey, metadata, 300);
    }

    const { 
      site_id: siteId, 
      account_id: accountId, 
      platform, 
      primary_domain: primaryDomain, 
      allowed_domains: allowedDomains, 
      challenge_mode: siteChallengeMode,
      max_requests: maxRequests 
    } = metadata;

    // 2. Kiểm tra Quota nguyên tử trên Redis Lua Script (Zero-lock, xử lý 50k+ req/s)
    const quotaResult = await this.redisService.checkAndIncrementQuota(
      accountId,
      parseInt(maxRequests, 10) || 10000,
    );

    if (!quotaResult.allowed) {
      throw new HttpException(
        {
          error: {
            code: 'quota_exceeded',
            message: `Tài khoản đã sử dụng vượt quá hạn mức ${(parseInt(maxRequests, 10) || 10000).toLocaleString()} requests/tháng của gói cước. Vui lòng nâng cấp gói.`,
          },
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // 3. Validate Domain / Bundle ID theo danh sách cho phép
    const isDomainAllowed = 
      dto.domain === primaryDomain || 
      (allowedDomains && allowedDomains.includes(dto.domain));

    if (!isDomainAllowed) {
      const errCode = platform === 'web' ? 'domain_not_allowed' : 'bundle_id_not_allowed';
      throw new ForbiddenException({
        error: { code: errCode, message: 'Nguồn gốc request (Domain/Bundle ID) không nằm trong whitelist' },
      });
    }

    // 4. Đánh giá rủi ro đa tầng qua RiskEngine (Behavior + Threat Intel + IP Reputation + Rate Limit)
    const riskEval = await this.riskEngineService.evaluateRisk(
      clientIp,
      dto.client_signals,
      dto.honeypot_filled,
      platform
    );

    // 5. Xác định Challenge Type theo cấu hình của Site (auto | none | slider | pow)
    const configuredMode = (siteChallengeMode || 'auto') as 'auto' | 'none' | 'slider' | 'pow';
    let effectiveChallengeType: 'none' | 'slider' | 'pow';
    let effectivePowDifficulty: number | null = null;

    if (configuredMode === 'slider') {
      effectiveChallengeType = 'slider';
      effectivePowDifficulty = null;
    } else if (configuredMode === 'pow') {
      effectiveChallengeType = 'pow';
      effectivePowDifficulty = riskEval.powDifficulty || 12;
    } else if (configuredMode === 'none') {
      effectiveChallengeType = 'none';
      effectivePowDifficulty = null;
    } else {
      // Mặc định 'auto': Thích ứng theo điểm số Risk Engine
      effectiveChallengeType = riskEval.challengeType;
      effectivePowDifficulty = riskEval.powDifficulty;
    }

    // Cho phép force_challenge ghi đè CHỈ khi chạy môi trường development/testing nội bộ
    const isDev = process.env.NODE_ENV !== 'production';
    if (isDev && dto.force_challenge) {
      effectiveChallengeType = dto.force_challenge;
      effectivePowDifficulty = dto.force_challenge === 'pow' ? (riskEval.powDifficulty || 12) : null;
    }

    // 3. Generate session ID and store in Redis (One-Time Token kèm thông tin phiên)
    const sessionId = uuidv4();
    const expiresIn = 60; // 60s TTL theo ARCHITECTURE.md 3.2

    let sliderData: { y: number; seed: number; puzzle_size: number } | undefined = undefined;
    let targetX: number | undefined = undefined;
    let targetY: number | undefined = undefined;

    if (effectiveChallengeType === 'slider') {
      targetX = Math.floor(Math.random() * 170) + 50; // 50px đến 220px
      targetY = Math.floor(Math.random() * 75) + 25;  // 25px đến 100px
      const seed = Math.floor(Math.random() * 1000000);
      const puzzleSize = 40;

      sliderData = {
        y: targetY,
        seed,
        puzzle_size: puzzleSize,
      };
    }

    const sessionData = JSON.stringify({
      siteId,
      challengeType: effectiveChallengeType,
      powDifficulty: effectivePowDifficulty,
      riskScore: riskEval.riskScore,
      clientIp,
      breakdown: riskEval.breakdown,
      targetX,
      targetY,
      sliderTolerance: 5,
    });

    await this.redisService.setOneTimeToken(`session:${sessionId}`, expiresIn, sessionData);

    // Ghi nhận Request Tracking vào Redis O(1)
    await this.redisService.trackRequestEvent(siteId, 'issue', effectiveChallengeType);

    return {
      session_id: sessionId,
      challenge_type: effectiveChallengeType,
      pow_difficulty: effectivePowDifficulty,
      slider_data: sliderData,
      expires_in: expiresIn,
    };
  }
}
