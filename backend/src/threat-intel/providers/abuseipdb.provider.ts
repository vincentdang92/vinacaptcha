import { Injectable } from '@nestjs/common';
import { ThreatIntelSourceProvider } from '../provider.interface.js';

/**
 * AbuseIPDB Batch Sync — Tầng VỪA (risk scoring).
 * Community-reported IP database với confidence score 0-100.
 * Chỉ lấy IP có confidence ≥ 75 để tránh false-positive (threshold có thể cấu hình).
 * Free tier ~1,000 IP check/ngày → dùng batch endpoint, cache cục bộ 6-12h, KHÔNG gọi mỗi request.
 * Cần API key từ https://www.abuseipdb.com/register — set BACKEND_ABUSEIPDB_KEY trong .env.
 *
 * Quan trọng: Provider này pull top 10,000 IP bị report nhiều nhất gần đây
 * thay vì check từng IP theo request (tránh hết quota).
 */
@Injectable()
export class AbuseIpDbProvider implements ThreatIntelSourceProvider {
  sourceKey = 'abuseipdb';

  // Chỉ lấy IP có mức độ tin cậy báo cáo ≥ ngưỡng này (75 = balanced, 90 = strict)
  private readonly CONFIDENCE_THRESHOLD = 75;
  // Số lượng IP tối đa lấy trong mỗi lần sync
  private readonly MAX_RESULTS = 10000;

  async fetch(): Promise<{ cidr: string; category: string }[]> {
    const apiKey = process.env.BACKEND_ABUSEIPDB_KEY;

    if (!apiKey) {
      console.warn(
        '[AbuseIpDbProvider] Chưa cấu hình BACKEND_ABUSEIPDB_KEY. Bỏ qua nguồn này. ' +
        'Đăng ký miễn phí tại https://www.abuseipdb.com/register để lấy API key.',
      );
      return [];
    }

    try {
      // Endpoint blacklist: trả về IP bị báo cáo nhiều nhất trong 30 ngày gần đây
      const res = await fetch(
        `https://api.abuseipdb.com/api/v2/blacklist?confidenceMinimum=${this.CONFIDENCE_THRESHOLD}&limit=${this.MAX_RESULTS}`,
        {
          headers: {
            Key: apiKey,
            Accept: 'application/json',
            'User-Agent': 'VinaCaptcha-ThreatIntel/1.0',
          },
          signal: AbortSignal.timeout(30000), // Endpoint này có thể chậm với 10k records
        },
      );

      if (res.status === 429) {
        console.warn('[AbuseIpDbProvider] Hết quota AbuseIPDB hôm nay. Sẽ thử lại lần sync sau.');
        return [];
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json() as {
        data: Array<{ ipAddress: string; abuseConfidenceScore: number; countryCode: string }>;
      };

      const results = (json.data || []).map((entry) => ({
        cidr: `${entry.ipAddress}/32`,
        category: 'abuse_reported',
      }));

      console.log(
        `[AbuseIpDbProvider] Đã tải ${results.length} IP với confidence ≥ ${this.CONFIDENCE_THRESHOLD}%`,
      );
      return results;
    } catch (err) {
      console.warn('[AbuseIpDbProvider] Fetch thất bại:', err);
      return [];
    }
  }
}
