import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from './prisma/prisma.module';
import { AiModule } from './ai/ai.module';
import { SourceModule } from './source/source.module';
import { DigestModule } from './digest/digest.module';
import { MessageModule } from './message/message.module';
import { TelegramModule } from './telegram/telegram.module';
import { CronModule } from './cron/cron.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AiModule,
    SourceModule,
    DigestModule,
    MessageModule,
    TelegramModule,
    CronModule,
  ],
})
export class AppModule {}
