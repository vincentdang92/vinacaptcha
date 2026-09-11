import { Injectable } from '@nestjs/common';
import { ThreatIntelSourceProvider } from '../provider.interface.js';

/**
 * Google Cloud IP Ranges — Tầng CỨNG (Datacenter).
 * Traffic từ Google Cloud thường là bot, crawler, hoặc abuse automation.
 * Fetch từ endpoint JSON chính thức do Google publish (không cần API key).
 * Bổ sung cho AWS để có đủ coverage các nền tảng cloud lớn.
 */
@Injectable()
export class GoogleCloudProvider implements ThreatIntelSourceProvider {
  sourceKey = 'gcp';

  async fetch(): Promise<{ cidr: string; category: string }[]> {
    try {
      const res = await fetch('https://www.gstatic.com/ipranges/cloud.json', {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'NhanHoaCaptcha-ThreatIntel/1.0' },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json() as {
        prefixes: Array<{ ipv4Prefix?: string; ipv6Prefix?: string; service: string; scope: string }>;
      };

      const results: { cidr: string; category: string }[] = [];
      for (const prefix of json.prefixes || []) {
        // Lấy IPv4 trước, bỏ qua IPv6 để tránh phức tạp DB
        const cidr = prefix.ipv4Prefix;
        if (cidr) {
          results.push({ cidr, category: 'datacenter' });
        }
      }

      console.log(`[GoogleCloudProvider] Đã tải ${results.length} dải IPv4 Google Cloud`);
      return results;
    } catch (err) {
      console.warn('[GoogleCloudProvider] Không thể fetch GCP ranges:', err);
      // Fallback một số dải GCP tiêu biểu
      return [
        '34.64.0.0/10', '35.184.0.0/13', '35.192.0.0/14',
        '104.154.0.0/15', '146.148.0.0/17',
      ].map((cidr) => ({ cidr, category: 'datacenter' }));
    }
  }
}
