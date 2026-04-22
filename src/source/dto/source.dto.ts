import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsIn,
  IsObject,
} from 'class-validator';

export class CreateSourceDto {
  @ApiProperty({
    description: 'Nền tảng nguồn tin nhắn',
    enum: ['telegram', 'whatsapp'],
    example: 'telegram',
  })
  @IsString()
  @IsIn(['telegram', 'whatsapp'])
  platform: string;

  @ApiProperty({
    description: 'ID của group/chat trên nền tảng (VD: Telegram chat_id)',
    example: '-1001234567890',
  })
  @IsString()
  externalId: string;

  @ApiPropertyOptional({
    description: 'Tên gợi nhớ cho nguồn',
    example: 'Group Xăng Dầu Indo',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Cấu hình riêng cho source này (JSON)',
    example: { debounceSeconds: 120 },
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}

export class UpdateSourceDto {
  @ApiPropertyOptional({
    description: 'Tên gợi nhớ cho nguồn',
    example: 'Group Xăng Dầu Indo - Updated',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Bật/tắt lắng nghe',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    description: 'Cấu hình riêng cho source này (JSON)',
  })
  @IsOptional()
  @IsObject()
  config?: Record<string, any>;
}
