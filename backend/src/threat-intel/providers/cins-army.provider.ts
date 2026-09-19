import { Injectable } from '@nestjs/common';
import { ThreatIntelSourceProvider } from '../provider.interface.js';

/**
 * CINS Army (Collective Intelligence Network Security / CI Bad Guys) — Tầng CỨNG.
 * Feed các IP có điểm rủi ro cao từ mạng lưới cảm biến Sentinel IDS/IPS toàn cầu của Nomic Networks.
 * Public feed miễn phí.
 * Format: 1 IP/dòng.
 */
@Injectable()
export class CinsArmyProvider implements ThreatIntelSourceProvider {
  sourceKey = 'cins_army';

  async fetch(): Promise<{ cidr: string; category: string }[]> {
    const url = 'https://cinsscore.com/list/ci-badguys.txt';
    const results: { cidr: string; category: string }[] = [];

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
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

      console.log(`[CinsArmyProvider] Đã tải ${results.length} IP độc hại từ CINS Army`);
      return results;
    } catch (err) {
      console.warn('[CinsArmyProvider] Fetch thất bại, dùng fallback:', (err as Error).message);
      return [
        '45.148.10.0/24',
        '89.248.165.0/24',
      ].map((cidr) => ({ cidr, category: 'attacks' }));
    }
  }
}
