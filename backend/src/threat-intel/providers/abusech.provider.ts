import { Injectable } from '@nestjs/common';
import { ThreatIntelSourceProvider } from '../provider.interface.js';

/**
 * abuse.ch Feodo Tracker — C2 Botnet IP tracker. Tầng CỨNG.
 * Theo dõi Command & Control server của các botnet: Emotet, QakBot, Dridex, TrickBot...
 * Cập nhật ~30 phút, không cần API key, chất lượng cực cao.
 *
 * URLhaus: IP đang host/phân phối malware payload qua HTTP.
 */
@Injectable()
export class AbusechProvider implements ThreatIntelSourceProvider {
  sourceKey = 'abusech';

  async fetch(): Promise<{ cidr: string; category: string }[]> {
    const results: { cidr: string; category: string }[] = [];

    // Feodo Tracker: plain text, 1 IP per line
    await this.fetchPlainTextIps(
      'https://feodotracker.abuse.ch/downloads/ipblocklist_aggressive.txt',
      'botnet_c2',
      results,
    );

    console.log(`[AbusechProvider] Đã tải ${results.length} IP từ Feodo Tracker (Botnet C2)`);
    return results;
  }

  private async fetchPlainTextIps(
    url: string,
    category: string,
    results: { cidr: string; category: string }[],
  ) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: { 'User-Agent': 'NhanHoaCaptcha-ThreatIntel/1.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} từ ${url}`);

      const text = await res.text();
      for (const line of text.split('\n')) {
        // Bỏ comment (#) và dòng trống
        const ip = line.split('#')[0].trim();
        if (!ip || !ip.includes('.')) continue;

        results.push({
          cidr: ip.includes('/') ? ip : `${ip}/32`,
          category,
        });
      }
    } catch (err) {
      console.warn(`[AbusechProvider] Fetch thất bại ${url}:`, (err as Error).message);
    }
  }
}
