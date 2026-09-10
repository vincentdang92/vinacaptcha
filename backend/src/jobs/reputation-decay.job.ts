import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ReputationService } from '../reputation/reputation.service.js';

/**
 * Cron job phân rã (decay) điểm IP reputation định kỳ.
 * IP không vi phạm trong N ngày sẽ được giảm fail_count 50%
 * → cơ hội phục hồi, tránh block vĩnh viễn oan.
 *
 * Chạy lúc 3:00 AM hàng ngày — sau khi threat-intel-sync (2:00 AM) hoàn tất.
 */
@Injectable()
export class ReputationDecayJob {
  private readonly logger = new Logger(ReputationDecayJob.name);

  constructor(private readonly reputationService: ReputationService) {}

  @Cron('0 3 * * *', { name: 'reputation-decay' })
  async runDecay() {
    this.logger.log('⏳ [Cron] Bắt đầu phân rã điểm IP reputation...');
    try {
      // IP không vi phạm trong 7 ngày → giảm 50% fail_count
      await this.reputationService.decayOldEntries(7);
      this.logger.log('✅ [Cron] Phân rã reputation hoàn tất');
    } catch (err) {
      this.logger.error('❌ [Cron] Reputation decay lỗi:', err);
    }
  }
}
