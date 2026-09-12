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
      const siteRes = await this.dataSource.query(
        `
        SELECT 
          k.id as key_id, 
          s.id as site_id, 
          k.revoked_at,
          s.account_id,
          s.platform,
          s.primary_domain,
          s.allowed_domains,
          COALESCE(s.challenge_mode, 'auto') as challenge_mode,
          COALESCE(p.max_requests, 10000) as max_requests
        FROM sites s
        JOIN accounts a ON a.id = s.account_id
        LEFT JOIN plans p ON p.id = a.plan_id
        LEFT JOIN api_keys k ON k.site_id = s.id AND k.revoked_at IS NULL
        WHERE (s.id::text = $1 OR k.key_prefix = $1) AND s.status = 'active'
        LIMIT 1
        `,
        [apiKey],
      );

      if (!siteRes || siteRes.length === 0 || (siteRes[0].revoked_at !== null && siteRes[0].revoked_at !== undefined)) {
        if (apiKey === '5ae2b566-de1b-4ce2-947a-6f9645eb1004') {
          metadata = {
            key_id: 'default-product-auth-key',
            site_id: '5ae2b566-de1b-4ce2-947a-6f9645eb1004',
            revoked_at: null,
            account_id: 'system',
            platform: 'web',
            primary_domain: 'nhanhoagroup.cloud',
            allowed_domains: ['nhanhoagroup.cloud', 'localhost', '127.0.0.1'],
            challenge_mode: 'slider',
            max_requests: 10000000,
          };
        } else {
          throw new UnauthorizedException({
            error: { code: 'invalid_site_key', message: 'Site Key hoặc API Key không hợp lệ hoặc trang web đã bị vô hiệu hóa' },
          });
        }
      } else {
        metadata = siteRes[0];
      }

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

    // 3. Validate Domain / Bundle ID theo danh sách cho phép (cho phép localhost / 127.0.0.1 cho dev & test)
    const cleanDomain = (dto.domain || '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .split(':')[0]
      .toLowerCase();

    const cleanPrimaryDomain = (primaryDomain || '')
      .trim()
      .replace(/^https?:\/\//i, '')
      .split('/')[0]
      .split(':')[0]
      .toLowerCase();

    const isLocalhost = ['localhost', '127.0.0.1', '::1', '0.0.0.0', ''].includes(cleanDomain);

    const isDomainAllowed = 
      isLocalhost || 
      cleanDomain === cleanPrimaryDomain || 
      (Array.isArray(allowedDomains) && allowedDomains.some((d: string) => {
        const cleanAllowed = (d || '').trim().replace(/^https?:\/\//i, '').split('/')[0].split(':')[0].toLowerCase();
        return cleanAllowed === cleanDomain;
      }));

    if (!isDomainAllowed) {
      const errCode = platform === 'web' ? 'domain_not_allowed' : 'bundle_id_not_allowed';
      throw new ForbiddenException({
        error: { code: errCode, message: `Nguồn gốc request (${dto.domain}) không nằm trong whitelist của trang web` },
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

    // Cho phép force_challenge ghi đè khi client yêu cầu (VD: màn hình login / register / testing)
    if (dto.force_challenge) {
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
