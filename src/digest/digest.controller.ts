import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { DigestService } from './digest.service';
import { SummarizeRequestDto } from './dto/digest.dto';

@ApiTags('Digests')
@Controller('digests')
export class DigestController {
  constructor(private readonly digestService: DigestService) {}

  @Post('summarize')
  @ApiOperation({
    summary: 'Kích hoạt tóm tắt tin nhắn (On-demand)',
    description:
      'Gom tất cả tin nhắn chưa được tóm tắt (digestId = null) trong khoảng thời gian, nhóm theo source, và gọi AI summarize. Mặc định tóm tắt 24 giờ gần nhất.',
  })
  @ApiResponse({ status: 201, description: 'Tóm tắt thành công.' })
  summarize(@Body() dto: SummarizeRequestDto) {
    return this.digestService.summarize(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Liệt kê các bản tóm tắt',
    description: 'Trả về danh sách các MessageDigest mới nhất.',
  })
  @ApiQuery({ name: 'limit', required: false, type: Number, example: 20 })
  findAll(@Query('limit') limit?: string) {
    return this.digestService.findAll(limit ? parseInt(limit, 10) : 20);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Xem chi tiết bản tóm tắt',
    description:
      'Trả về chi tiết một MessageDigest kèm toàn bộ tin nhắn gốc tạo nên bản tóm tắt đó.',
  })
  @ApiResponse({ status: 404, description: 'Digest không tồn tại.' })
  findOne(@Param('id') id: string) {
    return this.digestService.findOne(id);
  }
}
