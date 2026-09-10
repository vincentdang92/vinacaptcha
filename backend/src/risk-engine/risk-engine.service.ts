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

    // ==========================================
    // 2. CHẤM ĐIỂM THREAT INTEL (Nguồn IP uy tín)
    // ==========================================
    const threatMatch = await this.threatIntelService.checkIp(clientIp);
    if (threatMatch.matched) {
      if (threatMatch.category === 'attacks' || threatMatch.category === 'spam') {
        // IP nằm trong Blacklist tấn công / spam quốc tế
        threatIntelScore += 80;
      } else if (threatMatch.category === 'tor' || threatMatch.category === 'proxy_anon') {
        // IP đi qua mạng Tor / Proxy ẩn danh
        threatIntelScore += 60;
      } else if (threatMatch.category === 'datacenter') {
        // IP thuộc Server Cloud (AWS, GCP...)
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
        // Đã fail quá 10 lần -> Coi như IP Banned
        reputationScore += 50;
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
    // 4. CHẤM ĐIỂM RATE LIMITING (Tần suất gọi /issue)
    // ==========================================
    const rateLimitKey = `ratelimit:issue:${clientIp}`;
    const requestCount = await this.redisService.incrementRateLimit(rateLimitKey, 10); // Cửa sổ 10s

    if (requestCount > 25) {
      // Spam dồn dập
      rateLimitScore += 50;
    } else if (requestCount > 10) {
      // Tần suất cao bất thường
      rateLimitScore += 25;
    }

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
        threatCategory: threatMatch.category,
        isBannedIp,
        clientSignals: signals, // Thêm thông số nguồn traffic để hiển thị trên Dashboard
      },
    };
  }
}
