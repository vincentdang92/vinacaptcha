import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ThreatIntelService } from '../threat-intel/threat-intel.service.js';

/**
 * Cron job đồng bộ Threat Intelligence theo 3 tầng tần suất.
 *
 * TẦNG CỨNG (1 lần/ngày — 2:00 AM):
 *   - AWS, GCP IP ranges       → datacenter bots
 *   - Tor Exit Nodes            → anonymization
 *   - Spamhaus DROP/EDROP       → hijacked/spam netblocks
 *   - FireHOL Level 1           → tổng hợp multi-source
 *   - abuse.ch Feodo + URLhaus  → botnet C2, malware host
 *
 * TẦNG VỪA (mỗi 6 giờ — 0:00, 6:00, 12:00, 18:00):
 *   - AbuseIPDB blacklist (cần API key) → community-reported IPs
 *
 * Thiết kế: mỗi sync DELETE + INSERT lại toàn bộ source đó (idempotent).
 * Không ảnh hưởng đến endpoint /issue và /verify vì chỉ query, không write tại runtime.
 */
@Injectable()
export class ThreatIntelSyncJob {
  private readonly logger = new Logger(ThreatIntelSyncJob.name);

  constructor(private readonly threatIntelService: ThreatIntelService) {}

  /**
   * TẦNG CỨNG — Sync nguồn free public, không giới hạn quota.
   * Chạy lúc 2:00 AM hàng ngày (server time).
   */
  @Cron('0 2 * * *', { name: 'threat-intel-hard-sync' })
  async syncHardTierSources() {
    this.logger.log('🔄 [Cron] Bắt đầu sync TẦNG CỨNG threat intel...');

    const hardSources = [
      'aws',
      'gcp',
      'digitalocean',
      'tor_exit',
      'spamhaus_drop',
      'firehol_level1',
      'abusech',
      'emerging_threats',
      'blocklist_de',
      'cins_army',
      'greensnow',
    ];
    const results: Record<string, number> = {};

    for (const source of hardSources) {
      try {
        const res = await this.threatIntelService.syncSource(source);
        results[source] = res.synced;
        this.logger.log(`  ✅ ${source}: ${res.synced.toLocaleString()} dải IP`);
      } catch (err) {
        results[source] = 0;
        this.logger.warn(`  ❌ ${source}: lỗi — ${(err as Error).message}`);
      }
    }

    const total = Object.values(results).reduce((s, v) => s + v, 0);
    this.logger.log(`✅ [Cron] TẦNG CỨNG hoàn tất: ${total.toLocaleString()} dải IP tổng cộng`);
  }

  /**
   * TẦNG VỪA — AbuseIPDB: cần API key, free tier ~1000 check/ngày → dùng batch endpoint.
   * Chạy mỗi 6 giờ. Nếu không có BACKEND_ABUSEIPDB_KEY, provider tự bỏ qua.
   */
  @Cron('0 */6 * * *', { name: 'threat-intel-medium-sync' })
  async syncMediumTierSources() {
    this.logger.log('🔄 [Cron] Bắt đầu sync TẦNG VỪA threat intel (AbuseIPDB)...');

    try {
      const res = await this.threatIntelService.syncSource('abuseipdb');
      if (res.synced > 0) {
        this.logger.log(`✅ [Cron] AbuseIPDB: ${res.synced.toLocaleString()} IP community-reported`);
      }
    } catch (err) {
      this.logger.warn(`❌ [Cron] AbuseIPDB sync lỗi: ${(err as Error).message}`);
    }
  }
}
