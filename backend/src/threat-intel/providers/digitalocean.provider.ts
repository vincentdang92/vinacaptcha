import { Injectable } from '@nestjs/common';
import { ThreatIntelSourceProvider } from '../provider.interface.js';

/**
 * DigitalOcean IP Ranges — Tầng CỨNG (Datacenter).
 * Danh mục toàn bộ dải IP VPS/Cloud của DigitalOcean do hãng phát hành công khai.
 * Traffic từ server cloud thường là bot cào dữ liệu, crawler hoặc spam script.
 * Format: CSV (cột 1 là dải CIDR).
 */
@Injectable()
export class DigitalOceanProvider implements ThreatIntelSourceProvider {
  sourceKey = 'digitalocean';

  async fetch(): Promise<{ cidr: string; category: string }[]> {
    const url = 'https://digitalocean.com/geo/google.csv';
    const results: { cidr: string; category: string }[] = [];

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'VinaCaptcha-ThreatIntel/1.0' },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status} từ ${url}`);

      const text = await res.text();
      for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Cột đầu tiên là CIDR: ví dụ "104.131.0.0/16,US,US-NY,New York,10001"
        const cidr = trimmed.split(',')[0].trim();
        if (cidr && cidr.includes('.')) {
          results.push({
            cidr: cidr.includes('/') ? cidr : `${cidr}/32`,
            category: 'datacenter',
          });
        }
      }

      console.log(`[DigitalOceanProvider] Đã tải ${results.length} dải IP DigitalOcean`);
      return results;
    } catch (err) {
      console.warn('[DigitalOceanProvider] Fetch thất bại, dùng fallback:', (err as Error).message);
      return [
        '104.131.0.0/16',
        '104.248.0.0/16',
        '138.68.0.0/16',
        '159.203.0.0/16',
        '167.99.0.0/16',
      ].map((cidr) => ({ cidr, category: 'datacenter' }));
    }
  }
}
