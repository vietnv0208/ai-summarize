import { Module } from '@nestjs/common';
import { CronService } from './cron.service';
import { DigestModule } from '../digest/digest.module';

@Module({
  imports: [DigestModule],
  providers: [CronService],
})
export class CronModule {}
