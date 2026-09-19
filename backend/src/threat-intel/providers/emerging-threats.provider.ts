import { Injectable } from '@nestjs/common';
import { ThreatIntelSourceProvider } from '../provider.interface.js';

/**
 * Proofpoint Emerging Threats (ET Open) Compromised IPs — Tầng CỨNG.
 * Danh sách máy chủ / IP bị chiếm quyền điều khiển (compromised) đang chủ động phát tán malware và tham gia botnet.
 * Public feed miễn phí do Proofpoint tài trợ cho cộng đồng bảo mật.
 * Format: 1 IP/dòng, có comment (#)
 */
@Injectable()
export class EmergingThreatsProvider implements ThreatIntelSourceProvider {
  sourceKey = 'emerging_threats';

  async fetch(): Promise<{ cidr: string; category: string }[]> {
    const url = 'https://rules.emergingthreats.net/blockrules/compromised-ips.txt';
    const results: { cidr: string; category: string }[] = [];

    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'VinaCaptcha-ThreatIntel/1.0' },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status} từ ${url}`);

      const text = await res.text();
      for (const line of text.split('\n')) {
        const ip = line.split('#')[0].trim();
        if (!ip || !ip.includes('.')) continue;

        results.push({
          cidr: ip.includes('/') ? ip : `${ip}/32`,
          category: 'botnet_c2',
        });
      }

      console.log(`[EmergingThreatsProvider] Đã tải ${results.length} IP compromised`);
      return results;
    } catch (err) {
      console.warn('[EmergingThreatsProvider] Fetch thất bại, dùng fallback:', (err as Error).message);
      return [
        '185.156.73.0/24',
        '194.26.29.0/24',
        '45.143.200.0/22',
      ].map((cidr) => ({ cidr, category: 'botnet_c2' }));
    }
  }
}
