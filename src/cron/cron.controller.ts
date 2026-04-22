import { Controller, Post } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CronService } from './cron.service';

@ApiTags('Cron Jobs')
@Controller('cron')
export class CronController {
  constructor(private readonly cronService: CronService) {}

  @Post('trigger-morning')
  @ApiOperation({
    summary: 'Test trigger: Chốt phiên sáng (00:00 - 12:00)',
    description: 'Bỏ qua lịch trình và chạy ngay logic chốt phiên sáng.',
  })
  @ApiResponse({ status: 201, description: 'Đã kích hoạt chạy cron job.' })
  async triggerMorning() {
    await this.cronService.morningDigest();
    return { success: true, message: 'Morning digest triggered' };
  }

  @Post('trigger-afternoon')
  @ApiOperation({
    summary: 'Test trigger: Chốt phiên chiều (12:00 - 18:00)',
    description: 'Bỏ qua lịch trình và chạy ngay logic chốt phiên chiều.',
  })
  @ApiResponse({ status: 201, description: 'Đã kích hoạt chạy cron job.' })
  async triggerAfternoon() {
    await this.cronService.afternoonDigest();
    return { success: true, message: 'Afternoon digest triggered' };
  }
}
