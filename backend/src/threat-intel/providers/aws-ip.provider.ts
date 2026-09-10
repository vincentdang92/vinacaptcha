import { Injectable } from '@nestjs/common';
import { ThreatIntelSourceProvider } from '../provider.interface.js';

/**
 * Provider danh sách IP Cloud / Datacenter từ AWS.
 * Fetch từ file JSON chính thức do AWS publish tại ip-ranges.amazonaws.com.
 * Traffic xuất phát từ server cloud thường là bot/crawler, không phải người dùng cuối thật.
 */
@Injectable()
export class AwsIpProvider implements ThreatIntelSourceProvider {
  sourceKey = 'aws';

  async fetch(): Promise<{ cidr: string; category: string }[]> {
    try {
      const response = await fetch('https://ip-ranges.amazonaws.com/ip-ranges.json', {
        signal: AbortSignal.timeout(15000), // Timeout 15s
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const json = await response.json() as { prefixes: Array<{ ip_prefix: string; service: string }> };
      const ranges = json.prefixes || [];

      return ranges.map((p) => ({
        cidr: p.ip_prefix,
        category: 'datacenter',
      }));
    } catch (err) {
      console.warn('[AwsIpProvider] Không thể fetch real data, dùng fallback:', err);
      // Fallback: một số dải đại diện khi không có network
      return [
        '3.0.0.0/9', '13.32.0.0/15', '18.184.0.0/15',
        '52.94.0.0/16', '54.240.0.0/16',
      ].map((cidr) => ({ cidr, category: 'datacenter' }));
    }
  }
}
