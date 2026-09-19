import { Injectable } from '@nestjs/common';
import { ThreatIntelService } from '../threat-intel/threat-intel.service.js';
import { ReputationService } from '../reputation/reputation.service.js';
import { RedisService } from '../redis/redis.service.js';
import { ClientSignalsDto } from '../issue/dto/issue.dto.js';

export interface RiskEvaluationResult {
  riskScore: number; // 0 - 100
  challengeType: 'none' | 'slider' | 'pow';
  powDifficulty: number | null;
  breakdown: {
    clientBehaviorScore: number;
    threatIntelScore: number;
    reputationScore: number;
    rateLimitScore: number;
    rateLimitCounts?: { count10s: number; count10m: number; count1h: number };
    isRateLimitExceeded?: boolean;
    threatCategory?: string;
    isBannedIp?: boolean;
    clientSignals?: ClientSignalsDto;
  };
}

@Injectable()
export class RiskEngineService {
  constructor(
    private readonly threatIntelService: ThreatIntelService,
    private readonly reputationService: ReputationService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Đánh giá rủi ro tổng hợp cho 1 lượt gọi Issue Token.
   * Kết hợp:
   * 1. Hành vi Client (Client Signals: honeypot, webdriver, timing, mouse/keys)
   * 2. Threat Intel (Tor, Datacenter Cloud, Malicious IP list)
   * 3. IP Reputation nội bộ (Lịch sử vi phạm liên-site)
   * 4. Rate Limiting (Tần suất request qua Redis)
   */
  async evaluateRisk(
    clientIp: string,
    signals: ClientSignalsDto,
    honeypotFilled: boolean,
    platform: string = 'web',
  ): Promise<RiskEvaluationResult> {
    let clientBehaviorScore = 0;
    let threatIntelScore = 0;
    let reputationScore = 0;
    let rateLimitScore = 0;

    // ==========================================
    // 1. CHẤM ĐIỂM HÀNH VI CLIENT (Client Signals)
    // ==========================================
    if (honeypotFilled) {
      // Honeypot bị điền -> Chắc chắn là Bot tự động quét form
      clientBehaviorScore += 80;
    }

    if (signals.webdriver) {
      // Headless Chrome / Selenium / Puppeteer
      clientBehaviorScore += 60;
    }

    // Tốc độ điền form bất thường (< 600ms là tốc độ robot)
    if (signals.time_on_page_ms < 600) {
      clientBehaviorScore += 30;
    } else if (signals.time_on_page_ms < 1500) {
      clientBehaviorScore += 15;
    }

    // Không có bất kỳ tương tác vật lý nào (chuột không di chuyển và không gõ phím)
    const noMouse = (signals.mouse_moves ?? 0) === 0 && (signals.mouse_clicks ?? 0) === 0;
    const noKeys = (signals.key_strokes ?? 0) === 0;
    
    // Nếu là Mobile Native App, hành vi tương tác thường không thu thập được như DOM Web
    // Do đó nếu platform = web mới phạt điểm không tương tác.
    if (platform === 'web' && noMouse && noKeys) {
      clientBehaviorScore += 25;
    }

    // Canvas fingerprint bị lỗi hoặc không hỗ trợ (môi trường máy ảo rút gọn)
    if (signals.canvas_fingerprint === 'error' || signals.canvas_fingerprint === 'unsupported') {
      clientBehaviorScore += 15;
    }

    // Phát hiện bot submit lặp lại trên cùng 1 trang không có tương tác mới (Anti-Automation)
    if (signals.execution_count && signals.execution_count > 1) {
      if (noMouse && noKeys) {
        // Submit liên tiếp nhưng chuột/phím hoàn toàn đứng yên -> Vòng lặp Bot tự động
        clientBehaviorScore += 50;
      }
      if (signals.time_on_page_ms < 2000) {
        // Submit lặp lại liên tục cách nhau dưới 2 giây
        clientBehaviorScore += 35;
      }
      if (signals.execution_count >= 3) {
        // Submit từ lần thứ 3 trở lên trên cùng 1 trang -> Tăng dần điểm cảnh giác
        clientBehaviorScore += Math.min(40, (signals.execution_count - 2) * 15);
      }
    }

    // Phát hiện GPU ảo / Môi trường headless server (SwiftShader, llvmpipe, Mesa, VirtualBox, VMware)
    if (signals.gpu_renderer) {
      const lowerGpu = signals.gpu_renderer.toLowerCase();
      if (
        lowerGpu.includes('swiftshader') ||
        lowerGpu.includes('llvmpipe') ||
        lowerGpu.includes('mesa') ||
        lowerGpu.includes('virtualbox') ||
        lowerGpu.includes('vmware') ||
        lowerGpu.includes('software rasterizer')
      ) {
        clientBehaviorScore += 45;
      }
    }

    // Mâu thuẫn phần cứng (VD: màn hình ảo 0x0)
    if (signals.screen_width === 0 || signals.screen_height === 0) {
      clientBehaviorScore += 20;
    }

    // Điểm thưởng tương tác tự nhiên (giảm false-positive cho người dùng thật)
    const hasRichInteraction =
      (signals.mouse_moves ?? 0) > 10 &&
      (signals.key_strokes ?? 0) > 3 &&
      (signals.time_on_page_ms ?? 0) > 2500 &&
      (!signals.execution_count || signals.execution_count === 1);

    if (hasRichInteraction && clientBehaviorScore > 0) {
      clientBehaviorScore = Math.max(0, clientBehaviorScore - 10);
    }

    // ==========================================
    // 2. CHẤM ĐIỂM THREAT INTEL (Nguồn IP uy tín)
    // ==========================================
    const threatMatch = await this.threatIntelService.checkIp(clientIp);
    if (threatMatch.matched) {
      if (
        threatMatch.category === 'attacks' ||
        threatMatch.category === 'spam' ||
        threatMatch.category === 'botnet_c2' ||
        threatMatch.category === 'abuse_reported'
      ) {
        // IP nằm trong Blacklist tấn công / spam / botnet / abuse quốc tế
        threatIntelScore += 80;
      } else if (threatMatch.category === 'scanners') {
        // IP chuyên quét lỗ hổng và brute-force
        threatIntelScore += 65;
      } else if (threatMatch.category === 'tor' || threatMatch.category === 'proxy_anon') {
        // IP đi qua mạng Tor / Proxy ẩn danh
        threatIntelScore += 60;
      } else if (threatMatch.category === 'datacenter' || threatMatch.category === 'proxy_cdn') {
        // IP thuộc Server Cloud (AWS, GCP, DigitalOcean...)
        threatIntelScore += 35;
      }
    }

    // ==========================================
    // 3. CHẤM ĐIỂM IP REPUTATION (Lịch sử liên-site)
    // ==========================================
    const repMatch = await this.reputationService.checkIpReputation(clientIp);
    let isBannedIp = false;

    if (repMatch.hasRecord) {
      if (repMatch.isBanned) {
        // Đã fail quá 10 lần -> Coi như IP Banned (Max risk score 100)
        reputationScore += 100;
        isBannedIp = true;
      } else if (repMatch.failCount >= 5) {
        reputationScore += 35;
      } else if (repMatch.failCount >= 2) {
        reputationScore += 15;
      }

      // Hệ số tăng cường nếu IP này đã từng bị flag ở từ 2 site trở lên
      if (repMatch.siteCountSeen >= 2) {
        reputationScore = Math.round(reputationScore * 1.5);
      }
    }

    // ==========================================
    // 4. CHẤM ĐIỂM RATE LIMITING ĐA TẦNG (10s, 10m, 1h)
    // ==========================================
    // Đo lường vận tốc request song song trên 3 cửa sổ thời gian để bắt cả Burst Spam và Low & Slow Bot
    const [count10s, count10m, count1h] = await Promise.all([
      this.redisService.incrementRateLimit(`ratelimit:issue:10s:${clientIp}`, 10),    // 10s window (Burst)
      this.redisService.incrementRateLimit(`ratelimit:issue:10m:${clientIp}`, 600),   // 10m window (Low & Slow)
      this.redisService.incrementRateLimit(`ratelimit:issue:1h:${clientIp}`, 3600),   // 1h window (Scraping)
    ]);

    // 4.1. Cửa sổ 10 giây (Burst attack)
    if (count10s > 20) {
      rateLimitScore += 70;
    } else if (count10s > 10) {
      rateLimitScore += 45;
    } else if (count10s > 4) {
      rateLimitScore += 25;
    }

    // 4.2. Cửa sổ 10 phút (Low & Slow Bot: submit cách nhau 1-2 phút)
    if (count10m > 20) {
      rateLimitScore += 80;
    } else if (count10m > 10) {
      // > 10 lần / 10 phút (bắt trường hợp 13 lần/10 phút)
      rateLimitScore += 60;
    } else if (count10m > 5) {
      rateLimitScore += 35;
    }

    // 4.3. Cửa sổ 1 giờ (Scraping kéo dài)
    if (count1h > 60) {
      rateLimitScore += 60;
    } else if (count1h > 30) {
      rateLimitScore += 35;
    }

    // Đánh dấu cờ vượt ngưỡng spam cần chặn cứng
    const isRateLimitExceeded = count10m > 10 || count10s > 20 || count1h > 60;

    // ==========================================
    // 5. TỔNG HỢP VÀ PHÂN LOẠI CHALLENGE (Escalation)
    // ==========================================
    const totalRawScore = clientBehaviorScore + threatIntelScore + reputationScore + rateLimitScore;
    const finalScore = Math.min(100, Math.max(0, totalRawScore));

    let challengeType: 'none' | 'slider' | 'pow' = 'none';
    let powDifficulty: number | null = null;

    if (finalScore >= 70 || isBannedIp) {
      // Nguy cơ cao -> Bắt buộc PoW (Proof of Work)
      challengeType = 'pow';
      if (finalScore >= 90 || isBannedIp) {
        powDifficulty = 18; // Khó cao, tiêu tốn CPU đáng kể của Bot farm
      } else if (finalScore >= 80) {
        powDifficulty = 14;
      } else {
        powDifficulty = 12;
      }
    } else if (finalScore >= 30) {
      // Nghi ngờ trung bình -> Slider Puzzle kéo ghép hình
      challengeType = 'slider';
    } else {
      // An toàn -> Invisible Pass không làm phiền người dùng
      challengeType = 'none';
    }

    return {
      riskScore: finalScore,
      challengeType,
      powDifficulty,
      breakdown: {
        clientBehaviorScore,
        threatIntelScore,
        reputationScore,
        rateLimitScore,
        rateLimitCounts: { count10s, count10m, count1h },
        isRateLimitExceeded,
        threatCategory: threatMatch.category,
        isBannedIp,
        clientSignals: signals, // Thêm thông số nguồn traffic để hiển thị trên Dashboard
      },
    };
  }
}
