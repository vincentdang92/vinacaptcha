import { Injectable, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ThreatIntelSourceProvider } from './provider.interface.js';
import { AwsIpProvider } from './providers/aws-ip.provider.js';
import { TorExitProvider } from './providers/tor-exit.provider.js';
import { MockThreatProvider } from './providers/mock-threat.provider.js';
import { SpamhausProvider } from './providers/spamhaus.provider.js';
import { GoogleCloudProvider } from './providers/google-cloud.provider.js';
import { AbusechProvider } from './providers/abusech.provider.js';
import { AbuseIpDbProvider } from './providers/abuseipdb.provider.js';

export interface ThreatMatchResult {
  matched: boolean;
  category?: string;
  source?: string;
  cidr?: string;
}

@Injectable()
export class ThreatIntelService implements OnModuleInit {
  private providers = new Map<string, ThreatIntelSourceProvider>();

  constructor(
    private readonly dataSource: DataSource,
    // Tầng CỨNG — sync 1 lần/ngày
    private readonly awsProvider: AwsIpProvider,
    private readonly gcpProvider: GoogleCloudProvider,
    private readonly torProvider: TorExitProvider,
    private readonly spamhausProvider: SpamhausProvider,
    private readonly fireHolProvider: MockThreatProvider,
    private readonly abusechProvider: AbusechProvider,
    // Tầng VỪA — sync mỗi 6-12h, cần API key
    private readonly abuseIpDbProvider: AbuseIpDbProvider,
  ) {
    // Đăng ký toàn bộ providers theo Connector Pattern (ARCHITECTURE.md 3.6)
    this.registerProvider(this.awsProvider);
    this.registerProvider(this.gcpProvider);
    this.registerProvider(this.torProvider);
    this.registerProvider(this.spamhausProvider);
    this.registerProvider(this.fireHolProvider);
    this.registerProvider(this.abusechProvider);
    this.registerProvider(this.abuseIpDbProvider);
  }

  async onModuleInit() {
    // Tự động kiểm tra và seed dữ liệu nếu bảng threat_intel_ranges còn trống
    try {
      const countRes = await this.dataSource.query('SELECT COUNT(*) as count FROM threat_intel_ranges');
      if (parseInt(countRes[0]?.count || '0', 10) === 0) {
        console.log('[ThreatIntelService] Bảng threat_intel_ranges trống. Bắt đầu seed dữ liệu khởi tạo...');
        await this.syncAllSources();
      }
    } catch (err) {
      console.warn('[ThreatIntelService] Không thể kiểm tra threat_intel_ranges lúc khởi động:', err);
    }
  }

  /**
   * Đăng ký thêm 1 Threat Intel Source Provider
   */
  registerProvider(provider: ThreatIntelSourceProvider) {
    this.providers.set(provider.sourceKey, provider);
  }

  /**
   * Tra cứu 1 địa chỉ IP xem có thuộc dải Threat Intel (Tor, Cloud, Attackers) nào không.
   * Sử dụng toán tử containment `cidr >>= $1` tận dụng index GiST trên PostgreSQL.
   */
  async checkIp(ip: string): Promise<ThreatMatchResult> {
    // IP local không cần tra cứu
    if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
      return { matched: false };
    }

    try {
      const results = await this.dataSource.query(
        `
        SELECT source, category, cidr::text as cidr
        FROM threat_intel_ranges
        WHERE cidr >>= $1::inet
        LIMIT 1
        `,
        [ip],
      );

      if (results && results.length > 0) {
        const match = results[0];
        return {
          matched: true,
          category: match.category,
          source: match.source,
          cidr: match.cidr,
        };
      }

      return { matched: false };
    } catch (err) {
      console.error(`[ThreatIntelService] Lỗi khi tra cứu IP ${ip}:`, err);
      return { matched: false };
    }
  }

  /**
   * Chuẩn hoá CIDR: đảm bảo host bits = 0 để PostgreSQL không reject.
   * VD: "1.2.3.4/24" → "1.2.3.0/24", "1.2.3.4" → "1.2.3.4/32"
   */
  private normalizeCidr(raw: string): string | null {
    try {
      let cidr = raw.trim();
      if (!cidr) return null;

      if (!cidr.includes('/')) {
        // IP đơn → /32
        cidr = `${cidr}/32`;
      }

      const [ipPart, prefixStr] = cidr.split('/');
      const prefix = parseInt(prefixStr, 10);
      if (isNaN(prefix) || prefix < 0 || prefix > 32) return null;

      // Parse IPv4 → mask host bits
      const parts = ipPart.split('.').map(Number);
      if (parts.length !== 4 || parts.some((p) => isNaN(p) || p < 0 || p > 255)) return null;

      const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
      const ipNum =
        ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
      const maskedNum = (ipNum & mask) >>> 0;

      const maskedIp = [
        (maskedNum >>> 24) & 0xff,
        (maskedNum >>> 16) & 0xff,
        (maskedNum >>> 8) & 0xff,
        maskedNum & 0xff,
      ].join('.');

      return `${maskedIp}/${prefix}`;
    } catch {
      return null;
    }
  }

  /**
   * Đồng bộ dữ liệu cho 1 nguồn cụ thể (Delete + Insert lại toàn bộ)
   */
  async syncSource(sourceKey: string): Promise<{ synced: number }> {
    const provider = this.providers.get(sourceKey);
    if (!provider) {
      throw new Error(`Provider cho nguồn '${sourceKey}' không tồn tại.`);
    }

    const rawEntries = await provider.fetch();
    if (!rawEntries || rawEntries.length === 0) {
      return { synced: 0 };
    }

    // Chuẩn hoá và lọc CIDR không hợp lệ trước khi insert
    const entries = rawEntries
      .map((e) => ({ ...e, cidr: this.normalizeCidr(e.cidr) }))
      .filter((e): e is { cidr: string; category: string } => e.cidr !== null);

    const skipped = rawEntries.length - entries.length;
    if (skipped > 0) {
      console.warn(`[ThreatIntelService] Bỏ qua ${skipped} CIDR không hợp lệ từ nguồn ${sourceKey}`);
    }

    // Xoá dữ liệu cũ của source này và insert lại toàn bộ để tránh dữ liệu rác
    await this.dataSource.transaction(async (manager) => {
      await manager.query('DELETE FROM threat_intel_ranges WHERE source = $1', [sourceKey]);

      for (const entry of entries) {
        await manager.query(
          `
          INSERT INTO threat_intel_ranges (source, category, cidr, fetched_at)
          VALUES ($1, $2, $3::cidr, NOW())
          ON CONFLICT (source, cidr) DO NOTHING
          `,
          [sourceKey, entry.category, entry.cidr],
        );
      }
    });

    console.log(`[ThreatIntelService] Đã đồng bộ ${entries.length} dải IP từ nguồn ${sourceKey}`);
    return { synced: entries.length };
  }

  /**
   * Đồng bộ tất cả các nguồn đang được đăng ký
   */
  async syncAllSources(): Promise<Record<string, number>> {
    const results: Record<string, number> = {};
    for (const [key] of this.providers) {
      try {
        const res = await this.syncSource(key);
        results[key] = res.synced;
      } catch (err) {
        console.error(`[ThreatIntelService] Lỗi sync nguồn ${key}:`, err);
        results[key] = 0;
      }
    }
    return results;
  }
}
