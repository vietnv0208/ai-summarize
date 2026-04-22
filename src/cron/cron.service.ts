import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DigestService } from '../digest/digest.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(private readonly digestService: DigestService) {}

  /**
   * Chốt phiên sáng: Tóm tắt tin nhắn từ 00:00 đến 12:00
   * Chạy lúc 12:00 trưa hàng ngày
   */
  @Cron('0 12 * * *', { name: 'morning-digest' })
  async morningDigest() {
    this.logger.log('⏰ Running morning digest cron job...');

    const today = new Date();
    const from = new Date(today);
    from.setHours(0, 0, 0, 0);

    const to = new Date(today);
    to.setHours(12, 0, 0, 0);

    try {
      const result = await this.digestService.summarize({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      this.logger.log(
        `✅ Morning digest completed: ${result.digestsCreated} digests created`,
      );
    } catch (error) {
      this.logger.error('❌ Morning digest failed:', error);
    }
  }

  /**
   * Chốt phiên chiều: Tóm tắt tin nhắn từ 12:00 đến 18:00
   * Chạy lúc 18:00 chiều hàng ngày
   */
  @Cron('0 18 * * *', { name: 'afternoon-digest' })
  async afternoonDigest() {
    this.logger.log('⏰ Running afternoon digest cron job...');

    const today = new Date();
    const from = new Date(today);
    from.setHours(12, 0, 0, 0);

    const to = new Date(today);
    to.setHours(18, 0, 0, 0);

    try {
      const result = await this.digestService.summarize({
        from: from.toISOString(),
        to: to.toISOString(),
      });
      this.logger.log(
        `✅ Afternoon digest completed: ${result.digestsCreated} digests created`,
      );
    } catch (error) {
      this.logger.error('❌ Afternoon digest failed:', error);
    }
  }
}
