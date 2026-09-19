import { Injectable } from '@nestjs/common';
import { ThreatIntelSourceProvider } from '../provider.interface.js';

/**
 * GreenSnow Threat Feed — Tầng CỨNG.
 * Thu thập IP chuyên thực hiện quét cổng, tìm kiếm lỗ hổng web app và spam form.
 * Public feed miễn phí.
 * Format: 1 IP/dòng.
 */
@Injectable()
export class GreenSnowProvider implements ThreatIntelSourceProvider {
  sourceKey = 'greensnow';

  async fetch(): Promise<{ cidr: string; category: string }[]> {
    const url = 'https://blocklist.greensnow.co/greensnow.txt';
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
          category: 'scanners',
        });
      }

      console.log(`[GreenSnowProvider] Đã tải ${results.length} IP scanner từ GreenSnow`);
      return results;
    } catch (err) {
      console.warn('[GreenSnowProvider] Fetch thất bại, dùng fallback:', (err as Error).message);
      return [
        '185.191.171.0/24',
        '194.26.29.0/24',
      ].map((cidr) => ({ cidr, category: 'scanners' }));
    }
  }
}
