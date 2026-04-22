import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SourceService } from './source.service';
import { CreateSourceDto, UpdateSourceDto } from './dto/source.dto';

@ApiTags('Sources')
@Controller('sources')
export class SourceController {
  constructor(private readonly sourceService: SourceService) {}

  @Post()
  @ApiOperation({
    summary: 'Thêm nguồn lắng nghe mới',
    description:
      'Đăng ký một group/chat cá nhân trên Telegram hoặc WhatsApp để hệ thống bắt đầu lắng nghe và lưu tin nhắn.',
  })
  @ApiResponse({ status: 201, description: 'Source đã được tạo thành công.' })
  @ApiResponse({ status: 409, description: 'Source với platform + externalId đã tồn tại.' })
  create(@Body() dto: CreateSourceDto) {
    return this.sourceService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Liệt kê tất cả nguồn lắng nghe',
    description:
      'Trả về danh sách tất cả các Source kèm thống kê số lượng tin nhắn và digest.',
  })
  findAll() {
    return this.sourceService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Xem chi tiết một nguồn' })
  @ApiResponse({ status: 404, description: 'Source không tồn tại.' })
  findOne(@Param('id') id: string) {
    return this.sourceService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Cập nhật nguồn lắng nghe',
    description: 'Cập nhật tên, trạng thái bật/tắt hoặc cấu hình riêng cho source.',
  })
  @ApiResponse({ status: 404, description: 'Source không tồn tại.' })
  update(@Param('id') id: string, @Body() dto: UpdateSourceDto) {
    return this.sourceService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Xóa nguồn lắng nghe' })
  @ApiResponse({ status: 404, description: 'Source không tồn tại.' })
  remove(@Param('id') id: string) {
    return this.sourceService.remove(id);
  }
}
