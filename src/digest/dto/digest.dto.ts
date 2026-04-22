import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class SummarizeRequestDto {
  @ApiPropertyOptional({
    description: 'ID của Source cần tóm tắt. Nếu không truyền thì tóm tắt tất cả.',
    example: 'uuid-of-source',
  })
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional({
    description: 'Thời gian bắt đầu (ISO 8601). Mặc định: 24 giờ trước.',
    example: '2026-04-21T00:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({
    description: 'Thời gian kết thúc (ISO 8601). Mặc định: hiện tại.',
    example: '2026-04-22T00:00:00.000Z',
  })
  @IsOptional()
  @IsString()
  to?: string;
}
