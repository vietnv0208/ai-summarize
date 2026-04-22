import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api');

  // Validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Swagger Setup
  const config = new DocumentBuilder()
    .setTitle('Oil Broker AI Assistant')
    .setDescription(
      'API để quản lý nguồn lắng nghe (Sources), xem tin nhắn thô (RawMessages), ' +
        'kích hoạt tóm tắt (Digests), và truy vấn tổng hợp (Q&A).',
    )
    .setVersion('1.0')
    .addTag('Sources', 'Quản lý các nguồn lắng nghe (Telegram groups, WhatsApp chats)')
    .addTag('Messages', 'Xem tin nhắn thô đã thu thập và thống kê')
    .addTag('Digests', 'Kích hoạt tóm tắt và xem lịch sử tóm tắt')
    .addTag('Telegram', 'Trạng thái kết nối Telegram Bot và Listener')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.PORT || 3000;
  await app.listen(port);

  console.log(`🚀 Application is running on: http://localhost:${port}`);
  console.log(`📚 Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
