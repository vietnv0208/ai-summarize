import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage, NewMessageEvent } from 'telegram/events';
import * as readline from 'readline';

@Injectable()
export class TelegramListenerService implements OnModuleInit {
  private readonly logger = new Logger(TelegramListenerService.name);
  private client: TelegramClient;
  private isConnected = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    const apiIdStr = this.configService.get<string>('TELEGRAM_API_ID');
    const apiId = apiIdStr ? parseInt(apiIdStr, 10) : undefined;
    const apiHash = this.configService.get<string>('TELEGRAM_API_HASH');
    const sessionString =
      this.configService.get<string>('TELEGRAM_SESSION') || '';

    const PLACEHOLDERS = ['12345678', 'your-api-hash-here'];
    if (
      !apiId ||
      !apiHash ||
      PLACEHOLDERS.includes(String(apiId)) ||
      PLACEHOLDERS.includes(apiHash)
    ) {
      this.logger.warn(
        '⚠️  TELEGRAM_API_ID / TELEGRAM_API_HASH not configured. Telegram listener disabled.',
      );
      return;
    }

    const session = new StringSession(sessionString);
    this.client = new TelegramClient(session, apiId, apiHash, {
      connectionRetries: 5,
    });

    await this.connect();
  }

  private async connect() {
    try {
      // Nếu đã có session string thì connect thẳng, không cần login lại
      if (this.configService.get<string>('TELEGRAM_SESSION')) {
        await this.client.connect();
        this.isConnected = true;
        this.logger.log('✅ Telegram user client connected (existing session)');
        this.setupListeners();
        return;
      }

      // Lần đầu: cần login bằng số điện thoại (interactive)
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const askQuestion = (question: string): Promise<string> =>
        new Promise((resolve) => rl.question(question, resolve));

      await this.client.start({
        phoneNumber: async () =>
          await askQuestion('📱 Enter your phone number: '),
        password: async () =>
          await askQuestion('🔑 Enter your 2FA password (if any): '),
        phoneCode: async () =>
          await askQuestion('📨 Enter the code you received: '),
        onError: (err) => this.logger.error('Telegram auth error:', err),
      });

      rl.close();

      // Lưu session string để lần sau không cần login lại
      const newSession = this.client.session.save() as unknown as string;
      this.logger.log(`\n✅ Telegram connected! Save this session string to .env:`);
      this.logger.log(`TELEGRAM_SESSION="${newSession}"\n`);

      this.isConnected = true;
      this.setupListeners();
    } catch (error) {
      this.logger.error('❌ Failed to connect Telegram client:', error);
    }
  }

  private setupListeners() {
    this.client.addEventHandler(
      (event: NewMessageEvent) => this.handleNewMessage(event),
      new NewMessage({}),
    );
    this.logger.log('👂 Listening for new messages...');
  }

  private async handleNewMessage(event: NewMessageEvent) {
    const message = event.message;
    if (!message || !message.chatId) return;

    const chatId = message.chatId.toString();
    const text = message.text || message.message || '';

    // Bỏ qua tin nhắn rỗng
    if (!text.trim()) return;

    try {
      // Kiểm tra xem chatId này có trong danh sách Source đang active không
      const source = await this.prisma.source.findFirst({
        where: {
          platform: 'telegram',
          externalId: chatId,
          isActive: true,
        },
      });

      if (!source) return; // Không theo dõi chat này

      // Lấy hoặc tạo Actor (người gửi)
      const senderId = message.senderId?.toString() || 'unknown';
      let senderName = 'Unknown';

      try {
        if (message.senderId) {
          const sender = await this.client.getEntity(message.senderId);
          if (sender instanceof Api.User) {
            senderName =
              [sender.firstName, sender.lastName].filter(Boolean).join(' ') ||
              sender.username ||
              'Unknown';
          }
        }
      } catch {
        // Không lấy được tên sender thì dùng default
      }

      const actor = await this.prisma.actor.upsert({
        where: {
          sourceId_externalId: {
            sourceId: source.id,
            externalId: senderId,
          },
        },
        update: { name: senderName },
        create: {
          sourceId: source.id,
          externalId: senderId,
          name: senderName,
        },
      });

      // Lưu tin nhắn thô
      await this.prisma.rawMessage.create({
        data: {
          sourceId: source.id,
          actorId: actor.id,
          externalId: message.id?.toString(),
          content: text,
          messageType: 'text',
          createdAt: message.date
            ? new Date(message.date * 1000)
            : new Date(),
        },
      });

      this.logger.debug(
        `📩 [${source.name || chatId}] ${senderName}: ${text.substring(0, 80)}...`,
      );
    } catch (error) {
      this.logger.error(`Failed to process message from chat ${chatId}:`, error);
    }
  }

  getConnectionStatus() {
    return {
      connected: this.isConnected,
      clientReady: !!this.client,
    };
  }

  async getDialogs(limit = 20) {
    if (!this.isConnected || !this.client) {
      throw new Error('Telegram client is not connected');
    }
    const dialogs = await this.client.getDialogs({ limit });
    return dialogs.map((d) => ({
      id: d.id?.toString(),
      name: d.title || d.name,
      isGroup: d.isGroup,
      isChannel: d.isChannel,
      isUser: d.isUser,
    }));
  }
}
