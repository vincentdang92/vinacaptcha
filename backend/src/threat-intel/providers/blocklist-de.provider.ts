import { Injectable } from '@nestjs/common';
import { ThreatIntelSourceProvider } from '../provider.interface.js';

/**
 * Blocklist.de All Attackers Feed — Tầng CỨNG.
 * Thu thập từ hơn 50.000 máy chủ Fail2ban toàn cầu báo cáo về các IP vừa tấn công SSH, Mail, Web POST.
 * Public feed miễn phí từ tổ chức phi lợi nhuận Châu Âu.
 * Format: 1 IP/dòng.
 */
@Injectable()
export class BlocklistDeProvider implements ThreatIntelSourceProvider {
  sourceKey = 'blocklist_de';

  async fetch(): Promise<{ cidr: string; category: string }[]> {
    const url = 'https://lists.blocklist.de/lists/all.txt';
    const results: { cidr: string; category: string }[] = [];

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(20000), // File danh sách tổng hợp có thể khá lớn
        headers: { 'User-Agent': 'VinaCaptcha-ThreatIntel/1.0' },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status} từ ${url}`);

      const text = await res.text();
      for (const line of text.split('\n')) {
        const ip = line.trim();
        if (!ip || !ip.includes('.') || ip.startsWith('#')) continue;

        results.push({
          cidr: ip.includes('/') ? ip : `${ip}/32`,
          category: 'attacks',
        });
      }

      console.log(`[BlocklistDeProvider] Đã tải ${results.length} IP kẻ tấn công từ Blocklist.de`);
      return results;
    } catch (err) {
      console.warn('[BlocklistDeProvider] Fetch thất bại, dùng fallback:', (err as Error).message);
      return [
        '185.220.101.0/24',
        '193.142.146.0/24',
      ].map((cidr) => ({ cidr, category: 'attacks' }));
    }
  }
}
