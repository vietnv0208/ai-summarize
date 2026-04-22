import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { DigestService } from '../digest/digest.service';
import { TelegramBotService } from '../telegram/telegram-bot.service';

@Injectable()
export class CronService {
  private readonly logger = new Logger(CronService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly digestService: DigestService,
    private readonly telegramBot: TelegramBotService,
  ) {}

  /**
   * Quét và gom các tin nhắn chưa xử lý thành khối hội thoại (MessageDigest)
   * Chạy định kỳ mỗi phút
   */
  @Cron('* * * * *', { name: 'group-idle-messages' })
  async groupIdleMessages() {
    try {
      const groupedCount = await this.digestService.groupIdleMessages();
      if (groupedCount > 0) {
        this.logger.log(`✅ Grouped messages for ${groupedCount} sources`);
      }
    } catch (error) {
      this.logger.error('❌ Failed to group idle messages:', error);
    }
  }

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

      // Gửi thông báo qua Telegram Bot
      await this.notifyBroker(result);
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

      await this.notifyBroker(result);
    } catch (error) {
      this.logger.error('❌ Afternoon digest failed:', error);
    }
  }

  /**
   * Gửi kết quả tóm tắt tới Broker qua Telegram Bot
   */
  private async notifyBroker(result: any) {
    const brokerChatId = this.configService.get<string>('BROKER_CHAT_ID');
    if (!brokerChatId || result.digestsCreated === 0) return;

    for (const digest of result.digests || []) {
      const msg =
        `📋 **Automated Digest**\n\n` +
        `🟢 **${digest.sourceName}**\n\n` +
        `${digest.summary}`;

      await this.telegramBot.sendNotification(brokerChatId, msg);
    }
  }
}
