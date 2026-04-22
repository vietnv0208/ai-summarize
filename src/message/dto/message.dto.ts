import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class QueryMessagesDto {
  @ApiPropertyOptional({
    description: 'Lọc theo Source ID',
    example: 'uuid-of-source',
  })
  @IsOptional()
  @IsString()
  sourceId?: string;

  @ApiPropertyOptional({
    description: 'Chỉ lấy tin nhắn chưa được tóm tắt',
    example: 'true',
  })
  @IsOptional()
  @IsString()
  undigested?: string;

  @ApiPropertyOptional({
    description: 'Số lượng tin nhắn tối đa',
    example: '50',
  })
  @IsOptional()
  @IsString()
  limit?: string;
}
