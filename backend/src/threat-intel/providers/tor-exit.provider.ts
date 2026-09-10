import { Injectable } from '@nestjs/common';
import { ThreatIntelSourceProvider } from '../provider.interface.js';

/**
 * Provider danh sách Tor Exit Nodes.
 * Fetch từ check.torproject.org/torbulkexitlist (public, cập nhật theo ngày).
 * IP đi qua mạng Tor thường được dùng để ẩn danh hoá các hành vi scraping/bruteforce.
 */
@Injectable()
export class TorExitProvider implements ThreatIntelSourceProvider {
  sourceKey = 'tor_exit';

  async fetch(): Promise<{ cidr: string; category: string }[]> {
    try {
      const response = await fetch('https://check.torproject.org/torbulkexitlist', {
        signal: AbortSignal.timeout(10000), // Timeout 10s
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();

      // Mỗi dòng là 1 IP. Bỏ qua comment (#) và dòng trống.
      const results: { cidr: string; category: string }[] = [];
      for (const line of text.split('\n')) {
        const ip = line.trim();
        if (ip && !ip.startsWith('#')) {
          results.push({ cidr: `${ip}/32`, category: 'tor' });
        }
      }

      console.log(`[TorExitProvider] Đã tải ${results.length} Tor exit nodes`);
      return results;
    } catch (err) {
      console.warn('[TorExitProvider] Không thể fetch real data, dùng fallback:', err);
      // Fallback khi không có network
      return [
        '185.220.100.240/32', '185.220.101.5/32',
        '185.220.102.8/32', '192.42.116.16/32',
        '199.249.230.70/32',
      ].map((cidr) => ({ cidr, category: 'tor' }));
    }
  }
}
