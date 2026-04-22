import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MessageService } from './message.service';
import { QueryMessagesDto } from './dto/message.dto';

@ApiTags('Messages')
@Controller('messages')
export class MessageController {
  constructor(private readonly messageService: MessageService) {}

  @Get()
  @ApiOperation({
    summary: 'Liệt kê tin nhắn thô',
    description:
      'Trả về danh sách tin nhắn thô (RawMessage) đã thu thập. Có thể lọc theo source và trạng thái đã/chưa tóm tắt.',
  })
  findAll(@Query() query: QueryMessagesDto) {
    return this.messageService.findAll(query);
  }

  @Get('stats')
  @ApiOperation({
    summary: 'Thống kê tổng quan hệ thống',
    description:
      'Trả về số lượng tổng tin nhắn, tin chưa tóm tắt, số bản digest, và số source đang hoạt động.',
  })
  getStats() {
    return this.messageService.getStats();
  }
}
