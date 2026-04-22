import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { TelegramBotService } from './telegram-bot.service';
import { TelegramListenerService } from './telegram-listener.service';

@ApiTags('Telegram')
@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly botService: TelegramBotService,
    private readonly listenerService: TelegramListenerService,
  ) {}

  @Get('status')
  @ApiOperation({
    summary: 'Kiểm tra trạng thái kết nối Telegram',
    description:
      'Trả về trạng thái của Telegram Bot (gửi thông báo) và Telegram Listener (đọc tin nhắn).',
  })
  getStatus() {
    return {
      bot: this.botService.getBotStatus(),
      listener: this.listenerService.getConnectionStatus(),
    };
  }
}
