import { Module } from '@nestjs/common';
import { CronService } from './cron.service';
import { CronController } from './cron.controller';
import { DigestModule } from '../digest/digest.module';
import { TelegramModule } from '../telegram/telegram.module';

@Module({
  imports: [DigestModule, TelegramModule],
  controllers: [CronController],
  providers: [CronService],
})
export class CronModule {}
