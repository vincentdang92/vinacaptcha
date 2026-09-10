import { Injectable } from '@nestjs/common';
import { ThreatIntelSourceProvider } from '../provider.interface.js';

/**
 * Spamhaus DROP (Don't Route Or Peer) — Tầng CỨNG.
 * Danh sách netblock bị hijack, spam gửi hàng loạt, hoặc nằm trong tay các tổ chức tội phạm mạng.
 * Đây là nguồn uy tín nhất trong ngành, được ISP và firewall doanh nghiệp dùng để block cứng.
 * Không cần API key, public domain, cập nhật vài lần mỗi ngày.
 */
@Injectable()
export class SpamhausProvider implements ThreatIntelSourceProvider {
  sourceKey = 'spamhaus_drop';

  async fetch(): Promise<{ cidr: string; category: string }[]> {
    const results: { cidr: string; category: string }[] = [];

    // DROP: Stolen/hijacked IPv4 space used by spammers & botnets
    await this.fetchList(
      'https://www.spamhaus.org/drop/drop.txt',
      'spam',
      results,
    );

    // EDROP: Extended DROP — còn nguy hiểm hơn, bao gồm delegated space cũng bị lạm dụng
    await this.fetchList(
      'https://www.spamhaus.org/drop/edrop.txt',
      'spam',
      results,
    );

    console.log(`[SpamhausProvider] Đã tải ${results.length} dải IP từ DROP + EDROP`);
    return results;
  }

  private async fetchList(
    url: string,
    category: string,
    results: { cidr: string; category: string }[],
  ) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'VinaCaptcha-ThreatIntel/1.0' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const text = await res.text();
      for (const line of text.split('\n')) {
        // Bỏ qua comment (;) và dòng trống
        const trimmed = line.split(';')[0].trim();
        if (!trimmed) continue;

        const cidr = trimmed.includes('/') ? trimmed : `${trimmed}/32`;
        results.push({ cidr, category });
      }
    } catch (err) {
      console.warn(`[SpamhausProvider] Không thể fetch ${url}:`, err);
    }
  }
}
