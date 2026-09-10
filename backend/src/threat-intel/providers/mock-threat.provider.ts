import { Injectable } from '@nestjs/common';
import { ThreatIntelSourceProvider } from '../provider.interface.js';

/**
 * Provider FireHOL Level 1 Blocklist — danh sách IP nguy cơ cao tổng hợp từ cộng đồng.
 * FireHOL level1 đã gộp sẵn: Spamhaus DROP, DShield, Feodo Tracker, fullbogons.
 * Fetch từ GitHub raw của dự án firehol/blocklist-ipsets (không cần API key, public).
 * Tương đương tích hợp nhiều nguồn IP xấu quốc tế qua 1 file duy nhất.
 */
@Injectable()
export class MockThreatProvider implements ThreatIntelSourceProvider {
  sourceKey = 'firehol_level1';

  async fetch(): Promise<{ cidr: string; category: string }[]> {
    const url = 'https://raw.githubusercontent.com/firehol/blocklist-ipsets/master/firehol_level1.netset';

    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(20000), // File này khoảng 1-2MB, cần timeout dài hơn
        headers: { 'User-Agent': 'VinaCaptcha-ThreatIntel/1.0' },
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const text = await response.text();

      // Parse: mỗi dòng là 1 CIDR hoặc IP đơn. Bỏ qua comment (#) và dòng trống.
      const results: { cidr: string; category: string }[] = [];
      for (const line of text.split('\n')) {
        const entry = line.trim();
        if (!entry || entry.startsWith('#')) continue;

        // Nếu không có /prefix thì là IP đơn → thêm /32
        const cidr = entry.includes('/') ? entry : `${entry}/32`;
        results.push({ cidr, category: 'attacks' });
      }

      console.log(`[FireHOL Level1] Đã tải ${results.length} dải IP nguy hiểm`);
      return results;
    } catch (err) {
      console.warn('[FireHOL Level1] Không thể fetch real data, dùng fallback:', err);
      // Fallback khi không có network hoặc GitHub không trả lời
      return [
        '198.51.100.0/24',
        '203.0.113.0/24',
        '45.143.200.0/22',
        '194.26.29.0/24',
      ].map((cidr) => ({ cidr, category: 'attacks' }));
    }
  }
}
