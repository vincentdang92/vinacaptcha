import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

export interface IpReputationResult {
  hasRecord: boolean;
  failCount: number;
  siteCountSeen: number;
  isBanned: boolean; // failCount > 10
}

@Injectable()
export class ReputationService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * Tra cứu lịch sử vi phạm của 1 IP trên toàn hệ thống (liên-site)
   * Sử dụng toán tử `ip_cidr >>= $1::inet` để so khớp cả IP đơn (/32) hoặc subnet.
   */
  async checkIpReputation(ip: string): Promise<IpReputationResult> {
    if (!ip || ip === 'localhost') {
      return { hasRecord: false, failCount: 0, siteCountSeen: 0, isBanned: false };
    }

    try {
      const res = await this.dataSource.query(
        `
        SELECT fail_count, site_count_seen, last_seen_at
        FROM ip_reputation
        WHERE ip_cidr >>= $1::inet
        ORDER BY fail_count DESC
        LIMIT 1
        `,
        [ip],
      );

      if (res && res.length > 0) {
        const failCount = parseInt(res[0].fail_count, 10) || 0;
        const siteCountSeen = parseInt(res[0].site_count_seen, 10) || 1;
        return {
          hasRecord: true,
          failCount,
          siteCountSeen,
          isBanned: failCount > 10,
        };
      }

      return { hasRecord: false, failCount: 0, siteCountSeen: 0, isBanned: false };
    } catch (err) {
      console.error(`[ReputationService] Lỗi tra cứu IP reputation cho ${ip}:`, err);
      return { hasRecord: false, failCount: 0, siteCountSeen: 0, isBanned: false };
    }
  }

  /**
   * Ghi nhận 1 lượt xác thực Thất bại (Verify Failed) từ 1 IP tại site cụ thể.
   * Tự động cập nhật fail_count và bảng sightings để đếm chính xác số site bị ảnh hưởng.
   */
  async recordVerificationFailure(ip: string, siteId: string): Promise<void> {
    if (!ip || ip === 'localhost') return;

    try {
      await this.dataSource.transaction(async (manager) => {
        // 1. Upsert vào ip_reputation
        await manager.query(
          `
          INSERT INTO ip_reputation (ip_cidr, fail_count, site_count_seen, first_seen_at, last_seen_at, updated_at)
          VALUES (set_masklen($1::inet, 32)::cidr, 1, 1, NOW(), NOW(), NOW())
          ON CONFLICT (ip_cidr) DO UPDATE
          SET fail_count = ip_reputation.fail_count + 1,
              last_seen_at = NOW(),
              updated_at = NOW()
          `,
          [ip],
        );

        // 2. Ghi nhận sighting của siteId này
        await manager.query(
          `
          INSERT INTO ip_reputation_sightings (ip_cidr, site_id, last_seen_at)
          VALUES (set_masklen($1::inet, 32)::cidr, $2, NOW())
          ON CONFLICT (ip_cidr, site_id) DO UPDATE
          SET last_seen_at = NOW()
          `,
          [ip, siteId],
        );

        // 3. Cập nhật lại site_count_seen chính xác theo số lượng site phân biệt
        await manager.query(
          `
          UPDATE ip_reputation
          SET site_count_seen = (
            SELECT COUNT(DISTINCT s.site_id)
            FROM ip_reputation_sightings s
            WHERE s.ip_cidr = set_masklen($1::inet, 32)::cidr
          )
          WHERE ip_cidr = set_masklen($1::inet, 32)::cidr
          `,
          [ip],
        );
      });

      console.log(`[ReputationService] Đã tăng fail_count cho IP ${ip} tại site ${siteId}`);
    } catch (err) {
      console.error(`[ReputationService] Lỗi khi ghi nhận failure cho IP ${ip}:`, err);
    }
  }

  /**
   * Giảm dần fail_count (Decay) cho các IP không vi phạm lại sau N ngày.
   * Tránh giữ oan IP động (4G, Wi-Fi quán cafe, NAT công ty).
   */
  async decayOldEntries(daysInactive: number = 14): Promise<{ decayed: number }> {
    try {
      const result = await this.dataSource.query(
        `
        UPDATE ip_reputation
        SET fail_count = GREATEST(0, FLOOR(fail_count / 2)),
            updated_at = NOW()
        WHERE last_seen_at < NOW() - ($1 || ' days')::interval
          AND fail_count > 0
        RETURNING ip_cidr
        `,
        [daysInactive],
      );

      // Xoá hẳn các record có fail_count = 0 và đã quá 30 ngày
      await this.dataSource.query(
        `
        DELETE FROM ip_reputation
        WHERE fail_count = 0
          AND last_seen_at < NOW() - INTERVAL '30 days'
        `,
      );

      const count = result?.length || 0;
      console.log(`[ReputationService] Đã decay điểm rủi ro cho ${count} IP không hoạt động ${daysInactive} ngày`);
      return { decayed: count };
    } catch (err) {
      console.error('[ReputationService] Lỗi khi thực hiện decay IP reputation:', err);
      return { decayed: 0 };
    }
  }
}
