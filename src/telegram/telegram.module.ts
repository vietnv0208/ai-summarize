import { Module } from '@nestjs/common';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramListenerService } from './telegram-listener.service';
import { TelegramController } from './telegram.controller';
import { DigestModule } from '../digest/digest.module';

@Module({
  imports: [DigestModule],
  controllers: [TelegramController],
  providers: [TelegramBotService, TelegramListenerService],
  exports: [TelegramBotService, TelegramListenerService],
})
export class TelegramModule {}
