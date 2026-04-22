import { Module } from '@nestjs/common';
import { CronService } from './cron.service';
import { DigestModule } from '../digest/digest.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [DigestModule, TelegramModule],
  providers: [CronService],
})
export class CronModule {}
