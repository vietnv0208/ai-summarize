import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Markup } from 'telegraf';
import { DigestService } from '../digest/digest.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Telegraf;
  private isRunning = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly digestService: DigestService,
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  async onModuleInit() {
    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');

    // Skip if token not set or still a placeholder
    if (!token || token === 'your-bot-token-here') {
      this.logger.warn(
        '⚠️  TELEGRAM_BOT_TOKEN not configured. Telegram bot disabled.',
      );
      return;
    }

    this.bot = new Telegraf(token);
    this.setupCommands();

    // Launch in background — catch errors so a bad token doesn't crash the app
    this.bot.launch().catch((err: Error) => {
      this.isRunning = false;
      this.logger.error(
        `❌ Telegram Bot failed to launch: ${err.message}. ` +
          'Check that TELEGRAM_BOT_TOKEN is valid.',
      );
    });
    
    // Assume it's running unless it fails
    this.isRunning = true;
    this.logger.log('🤖 Telegram Bot is running!');
  }

  async onModuleDestroy() {
    if (this.bot) {
      this.bot.stop('Application shutting down');
    }
  }

  private setupCommands() {
    // /start - Welcome message
    this.bot.command('start', (ctx) => {
      ctx.reply(
        '👋 Hello! I am your Oil Broker AI Assistant.\n\n' +
          'Available commands:\n' +
          '/sources - View monitored sources\n' +
          '/summarize - Summarize messages from the last 24h\n' +
          '/summarize_today - Summarize messages from today\n' +
          '/stats - View system statistics\n' +
          '/ask <question> - Ask AI about collected information\n',
      );
    });

    // /sources - Liệt kê source đang theo dõi
    this.bot.command('sources', async (ctx) => {
      try {
        const sources = await this.prisma.source.findMany({
          where: { isActive: true },
          include: {
            _count: { select: { messages: true, digests: true } },
          },
        });

        if (sources.length === 0) {
          return ctx.reply('📭 No sources are currently being monitored.');
        }

        let reply = '📡 **Monitored Sources:**\n\n';
        for (const s of sources) {
          reply +=
            `🔹 **${s.name || s.externalId}** (${s.platform})\n` +
            `   📨 ${s._count.messages} messages | 📋 ${s._count.digests} digests\n\n`;
        }

        ctx.reply(reply, { parse_mode: 'Markdown' });
      } catch (error) {
        this.logger.error('Error fetching sources:', error);
        ctx.reply('❌ Error fetching sources.');
      }
    });

    // /summarize - Tóm tắt 24h gần nhất
    this.bot.command('summarize', async (ctx) => {
      ctx.reply('⏳ Summarizing messages from the last 24 hours...');

      try {
        const result = await this.digestService.summarize({});

        if (result.digestsCreated === 0) {
          return ctx.reply('📭 No new messages to summarize.');
        }

        for (const digest of result.digests || []) {
          const msg =
            `🟢 **${digest.sourceName}**\n\n` +
            `${digest.summary}\n\n` +
            `_(${digest.messageCount} messages)_`;

          await ctx.reply(msg, { parse_mode: 'Markdown' });
        }
      } catch (error) {
        this.logger.error('Error in /summarize:', error);
        ctx.reply('❌ Error generating summary. Check server logs.');
      }
    });

    // /summarize_today - Tóm tắt tin nhắn hôm nay
    this.bot.command('summarize_today', async (ctx) => {
      ctx.reply('⏳ Summarizing today\'s messages...');

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      try {
        const result = await this.digestService.summarize({
          from: today.toISOString(),
        });

        if (result.digestsCreated === 0) {
          return ctx.reply('📭 No new messages to summarize today.');
        }

        for (const digest of result.digests || []) {
          const msg =
            `🟢 **${digest.sourceName}**\n\n` +
            `${digest.summary}\n\n` +
            `_(${digest.messageCount} messages)_`;

          await ctx.reply(msg, { parse_mode: 'Markdown' });
        }
      } catch (error) {
        this.logger.error('Error in /summarize_today:', error);
        ctx.reply('❌ Error generating summary. Check server logs.');
      }
    });

    // /stats - Thống kê
    this.bot.command('stats', async (ctx) => {
      try {
        const [totalMessages, undigested, totalDigests, activeSources] =
          await Promise.all([
            this.prisma.rawMessage.count(),
            this.prisma.rawMessage.count({ where: { digestId: null } }),
            this.prisma.messageDigest.count(),
            this.prisma.source.count({ where: { isActive: true } }),
          ]);

        ctx.reply(
          `📊 **System Statistics:**\n\n` +
            `📡 Monitored Sources: ${activeSources}\n` +
            `📨 Total Messages: ${totalMessages}\n` +
            `📝 Unsummarized: ${undigested}\n` +
            `📋 Digests created: ${totalDigests}`,
          { parse_mode: 'Markdown' },
        );
      } catch (error) {
        this.logger.error('Error in /stats:', error);
        ctx.reply('❌ Error fetching statistics.');
      }
    });

    // /ask - Trả lời câu hỏi
    this.bot.command('ask', async (ctx) => {
      const question = ctx.payload;
      if (!question) {
        return ctx.reply('💡 Usage: /ask <question>\nExample: /ask Were there any crude oil deals yesterday?');
      }

      ctx.reply('🤔 Searching and analyzing...');

      try {
        const answer = await this.answerQuestion(question, ctx.chat.id.toString());
        ctx.reply(answer, { parse_mode: 'Markdown' });
      } catch (error) {
        this.logger.error('Error in /ask:', error);
        ctx.reply('❌ Error processing question.');
      }
    });

    // Xử lý tin nhắn tự do (không phải command) - cũng coi như câu hỏi
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;
      const chatType = ctx.chat.type;
      const botUsername = ctx.botInfo?.username;

      // Trong group chat, chỉ phản hồi nếu bot được tag tên
      if (chatType === 'group' || chatType === 'supergroup') {
        if (!botUsername || !text.includes(`@${botUsername}`)) {
          return; // Bỏ qua nếu không được tag
        }
      }

      // Xóa tag tên bot khỏi câu hỏi để tránh nhiễu AI
      const cleanText = botUsername
        ? text.replace(`@${botUsername}`, '').trim()
        : text.trim();

      // Bỏ qua tin nhắn quá ngắn
      if (cleanText.length < 5) return;

      ctx.reply('🤔 Analyzing your question...');

      try {
        const answer = await this.answerQuestion(cleanText, ctx.chat.id.toString());
        ctx.reply(answer, { parse_mode: 'Markdown' });
      } catch (error) {
        this.logger.error('Error processing question:', error);
        ctx.reply('❌ Error processing question.');
      }
    });
  }

  /**
   * Trả lời câu hỏi tổng hợp bằng cách:
   * 1. Tìm các digest gần nhất liên quan
   * 2. Nhồi context vào LLM prompt
   * 3. Trả kết quả
   */
  private async answerQuestion(
    question: string,
    chatId: string,
  ): Promise<string> {
    // Lấy 20 digest gần nhất làm context
    const recentDigests = await this.prisma.messageDigest.findMany({
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        source: { select: { name: true, platform: true } },
      },
    });

    if (recentDigests.length === 0) {
      return '📭 No digest data available yet. Please run /summarize first.';
    }

    // Tạo context từ các digest
    const context = recentDigests
      .map(
        (d) =>
          `[${d.createdAt.toISOString().split('T')[0]} | ${d.source.name || 'Unknown'}]\n${d.summary}`,
      )
      .join('\n\n---\n\n');

    // Lưu/cập nhật conversation memory
    let conversation = await this.prisma.conversation.findUnique({
      where: { chatId },
    });

    const chatHistory: { role: string; content: string }[] = conversation
      ? (conversation.messages as any[])
      : [];

    // Giữ lại tối đa 10 tin nhắn gần nhất trong memory
    chatHistory.push({ role: 'user', content: question });
    const trimmedHistory = chatHistory.slice(-10);

    // Gọi AI
    const { default: OpenAI } = await import('openai');
    const openai = new OpenAI({
      apiKey: this.configService.get<string>('OPENAI_API_KEY'),
    });

    const response = await openai.chat.completions.create({
      model: this.configService.get<string>('OPENAI_MODEL') || 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            `You are an AI assistant for an Oil Broker. Based on the summarized data below, answer the user's question accurately and helpfully.\n\n` +
            `If no relevant information is found, clearly state that the data is not available.\n` +
            `**Language rule:** Detect the language of the user's question and respond in that SAME language. If the language cannot be determined, default to English.\n` +
            `Keep your answer concise and well-structured.\n\n` +
            `--- SUMMARIZED DATA ---\n${context}`,
        },
        ...trimmedHistory.map((m) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content,
        })),
      ],
      temperature: 0.4,
      max_tokens: 2000,
    });

    const answer =
      response.choices[0]?.message?.content || 'No answer generated.';

    // Cập nhật conversation memory
    trimmedHistory.push({ role: 'assistant', content: answer });

    await this.prisma.conversation.upsert({
      where: { chatId },
      update: { messages: trimmedHistory },
      create: { chatId, messages: trimmedHistory },
    });

    return answer;
  }

  /**
   * Gửi thông báo tới Broker (dùng bởi CronService sau khi digest xong)
   */
  async sendNotification(chatId: string, message: string) {
    if (!this.bot || !this.isRunning) {
      this.logger.warn('Bot not running, cannot send notification');
      return;
    }

    try {
      await this.bot.telegram.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
      });
    } catch (error) {
      this.logger.error(`Failed to send notification to ${chatId}:`, error);
    }
  }

  getBotStatus() {
    return { running: this.isRunning };
  }
}
