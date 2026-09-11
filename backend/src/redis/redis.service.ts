import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client: Redis;

  constructor(private configService: ConfigService) {}

  onModuleInit() {
    const redisUrl =
      this.configService.get<string>('BACKEND_REDIS_URL') ||
      this.configService.get<string>('REDIS_URL') ||
      'redis://redis:6379';
    this.client = new Redis(redisUrl);
  }

  onModuleDestroy() {
    if (this.client) {
      this.client.disconnect();
    }
  }

  getClient(): Redis {
    return this.client;
  }

  async setOneTimeToken(key: string, ttlSeconds: number, value: string = 'valid'): Promise<void> {
    await this.client.setex(key, ttlSeconds, value);
  }

  async useOneTimeToken(key: string): Promise<string | null> {
    // Atomically get and delete the key
    const result = await this.client.multi().get(key).del(key).exec();
    if (!result || result.length === 0 || result[0][1] === null) {
      return null;
    }
    return result[0][1] as string;
  }

  /**
   * Tăng biến đếm rate limit cho key với cửa sổ thời gian (windowSeconds)
   * Phục vụ cho tính toán tần suất request của IP trong Risk Engine
   */
  async incrementRateLimit(key: string, windowSeconds: number): Promise<number> {
    const current = await this.client.incr(key);
    if (current === 1) {
      await this.client.expire(key, windowSeconds);
    }
    return current;
  }

  /**
   * Kiểm tra và tăng hạn mức Quota theo tháng cho Account bằng Lua script nguyên tử.
   * Chạy O(1) in-memory trên Redis, không chạm Postgres, đảm bảo không race condition dưới tải cao.
   */
  async checkAndIncrementQuota(
    accountId: string,
    maxRequests: number,
    monthStr?: string,
  ): Promise<{ allowed: boolean; current: number; limit: number }> {
    const now = new Date();
    const month = monthStr || `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const quotaKey = `quota:acc:${accountId}:${month}`;

    // TTL 45 ngày để lưu giữ số liệu qua tháng sau trước khi dọn dẹp
    const ttlSeconds = 45 * 24 * 3600;

    const luaScript = `
      local current = redis.call('INCR', KEYS[1])
      if current == 1 then
        redis.call('EXPIRE', KEYS[1], tonumber(ARGV[2]))
      end
      local maxLimit = tonumber(ARGV[1])
      if maxLimit > 0 and current > maxLimit then
        return {0, current}
      else
        return {1, current}
      end
    `;

    const result = (await this.client.eval(
      luaScript,
      1,
      quotaKey,
      maxRequests.toString(),
      ttlSeconds.toString(),
    )) as [number, number];

    const allowed = result[0] === 1;
    const current = result[1];

    return { allowed, current, limit: maxRequests };
  }

  /**
   * Lấy số lượng request đã sử dụng trong tháng hiện tại của Account
   */
  async getAccountMonthlyUsage(accountId: string, monthStr?: string): Promise<number> {
    const now = new Date();
    const month = monthStr || `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const val = await this.client.get(`quota:acc:${accountId}:${month}`);
    return val ? parseInt(val, 10) : 0;
  }

  /**
   * Cache Metadata của Site/API Key trên Redis để tránh query Postgres trong hot path
   */
  async getApiKeyMetadataCache(apiKey: string): Promise<any | null> {
    const cached = await this.client.get(`meta:apikey:${apiKey}`);
    if (!cached) return null;
    try {
      return JSON.parse(cached);
    } catch {
      return null;
    }
  }

  async setApiKeyMetadataCache(apiKey: string, data: any, ttlSeconds = 300): Promise<void> {
    await this.client.setex(`meta:apikey:${apiKey}`, ttlSeconds, JSON.stringify(data));
  }

  async invalidateApiKeyCache(apiKey: string): Promise<void> {
    await this.client.del(`meta:apikey:${apiKey}`);
  }

  async invalidateAllApiKeyCache(): Promise<void> {
    const keys = await this.client.keys('meta:apikey:*');
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  /**
   * Ghi nhận sự kiện Request Tracking realtime vào Redis O(1) in-memory
   */
  async trackRequestEvent(
    siteId: string,
    eventType: 'issue' | 'verify_pass' | 'verify_fail',
    challengeType: string = 'none',
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const pipeline = this.client.pipeline();

    // Theo Site
    pipeline.incr(`tracking:site:${siteId}:total`);
    pipeline.incr(`tracking:site:${siteId}:${eventType}`);
    pipeline.incr(`tracking:site:${siteId}:challenge:${challengeType}`);
    pipeline.incr(`tracking:site:${siteId}:${today}`);
    pipeline.expire(`tracking:site:${siteId}:${today}`, 86400 * 30); // 30 ngày

    // Theo Global
    pipeline.incr('tracking:global:total');
    pipeline.incr(`tracking:global:${today}:${eventType}`);
    pipeline.expire(`tracking:global:${today}:${eventType}`, 86400 * 30);

    await pipeline.exec();
  }

  /**
   * Cache Dashboard Statistics trên Redis (TTL 5 phút)
   */
  async getDashboardStatsCache(): Promise<any | null> {
    const cached = await this.client.get('stats:dashboard:cache');
    if (!cached) return null;
    try {
      return JSON.parse(cached);
    } catch {
      return null;
    }
  }

  async setDashboardStatsCache(data: any, ttlSeconds = 300): Promise<void> {
    await this.client.setex('stats:dashboard:cache', ttlSeconds, JSON.stringify(data));
  }

  async invalidateDashboardStatsCache(): Promise<void> {
    await this.client.del('stats:dashboard:cache');
  }

  /**
   * Kiểm tra Domain có nằm trong danh sách website được đăng ký hoạt động trên hệ thống hay không (Dùng cho CORS)
   */
  async isDomainAllowed(domain: string, dataSource: any): Promise<boolean> {
    const cleanDomain = domain.trim().toLowerCase();
    
    // 1. Kiểm tra cache Redis Set O(1)
    const isMember = await this.client.sismember('cors:allowed_domains', cleanDomain);
    if (isMember === 1) {
      return true;
    }

    const cacheExists = await this.client.exists('cors:allowed_domains');
    if (cacheExists === 1) {
      return false;
    }

    // 2. Nếu Redis Set chưa có, load toàn bộ domain của các active site từ Postgres vào Redis Set
    try {
      const sites = await dataSource.query(`
        SELECT primary_domain, allowed_domains 
        FROM sites 
        WHERE status = 'active'
      `);

      const domainSet = new Set<string>();
      for (const site of sites) {
        if (site.primary_domain) {
          domainSet.add(site.primary_domain.trim().toLowerCase());
        }
        if (Array.isArray(site.allowed_domains)) {
          for (const d of site.allowed_domains) {
            if (d && typeof d === 'string') {
              domainSet.add(d.trim().toLowerCase());
            }
          }
        }
      }

      if (domainSet.size > 0) {
        const domains = Array.from(domainSet);
        const pipeline = this.client.pipeline();
        pipeline.sadd('cors:allowed_domains', ...domains);
        pipeline.expire('cors:allowed_domains', 300); // Cache 5 phút
        await pipeline.exec();
        return domainSet.has(cleanDomain);
      }
    } catch (err) {
      console.error('[RedisService] Lỗi nạp danh sách domain CORS:', err);
    }

    return false;
  }

  async invalidateCorsDomainsCache(): Promise<void> {
    await this.client.del('cors:allowed_domains');
  }
}
