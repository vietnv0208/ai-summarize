import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';
import { DigestService } from '../digest/digest.service';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';

@Injectable()
export class TelegramBotService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TelegramBotService.name);
  private bot: Telegraf;
  private isRunning = false;
  // Trạng thái người dùng chờ nhập input
  private userStates = new Map<number, { action: string; metadata?: any }>();

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

  public async registerCommands() {
    const commands = [
      { command: 'sources', description: 'View monitored sources' },
      { command: 'summarize', description: 'Summarize messages (choose time range)' },
      { command: 'stats', description: 'View system statistics' },
      { command: 'ask', description: 'Ask AI about collected information' },
    ];

    const token = this.configService.get<string>('TELEGRAM_BOT_TOKEN');
    if (!token || token === 'your-bot-token-here') {
      return { success: false, error: 'Bot token not configured' };
    }

    try {
      // Đăng ký commands cho nhiều scope khác nhau (Private, Group, Admin)
      const scopes = [
        { type: 'default' },
        { type: 'all_private_chats' },
        { type: 'all_group_chats' },
        { type: 'all_chat_administrators' }
      ];

      for (const scope of scopes) {
        await axios.post(`https://api.telegram.org/bot${token}/setMyCommands`, {
          commands,
          scope,
        });
      }

      this.logger.log('Bot commands registered successfully via API for all scopes');
      return {
        success: true,
        data: 'Commands registered for all scopes',
      };
    } catch (error: any) {
      this.logger.error('Failed to set bot commands:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data?.description || error.message,
      };
    }
  }

  private setupCommands() {
    // Đăng ký commands cho bot với Telegram
    this.registerCommands().catch(err => this.logger.error('Failed to set commands:', err));

    // /start - Welcome message
    this.bot.command('start', (ctx) => {
      ctx.reply(
        '👋 Hello! I am your Summarize AI Assistant.\n\n' +
          'Available commands:\n' +
          '/sources - View monitored sources\n' +
          '/summarize - Summarize messages (pick time range: 2h, 4h, 8h, 24h, 5d, 7d, 15d, 30d)\n' +
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

    // /summarize - Bước 1: Chọn khoảng thời gian
    this.bot.command('summarize', async (ctx) => {
      const timeRanges = [
        ['2h', '4h', '8h', '24h'],
        ['5d', '7d', '15d', '30d'],
      ];

      const buttons = timeRanges.map((row) =>
        row.map((t) => Markup.button.callback(t, `stime_${t}`)),
      );

      ctx.reply('⏱ Select time range to summarize:', Markup.inlineKeyboard(buttons));
    });

    // Bước 2: Sau khi chọn thời gian → chọn source
    this.bot.action(/^stime_(\d+[hd])$/, async (ctx) => {
      await ctx.answerCbQuery();
      const timeRange = ctx.match[1];

      try {
        const sources = await this.prisma.source.findMany({
          where: { isActive: true },
        });

        if (sources.length === 0) {
          return ctx.editMessageText('📭 No sources are currently being monitored.');
        }

        const buttons = sources.map((s) => [
          Markup.button.callback(
            s.name || s.externalId,
            `sdo_${timeRange}_${s.id}`,
          ),
        ]);
        buttons.push([Markup.button.callback('📡 All Sources', `sdo_${timeRange}_all`)]);

        ctx.editMessageText(
          `🕐 Time: last *${timeRange}*\n\nSelect a source to summarize:`,
          { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) },
        );
      } catch (error) {
        this.logger.error('Error fetching sources:', error);
        ctx.reply('❌ Error fetching sources.');
      }
    });

    // Bước 3: Thực hiện tóm tắt
    this.bot.action(/^sdo_(\d+[hd])_(.+)$/, async (ctx) => {
      await ctx.answerCbQuery();
      await ctx.sendChatAction('typing');

      const timeRange = ctx.match[1];
      const targetId = ctx.match[2];
      const sourceId = targetId === 'all' ? undefined : targetId;

      // Tính `from` từ timeRange
      const now = new Date();
      const value = parseInt(timeRange.slice(0, -1), 10);
      const unit = timeRange.slice(-1);
      const msAgo = unit === 'h' ? value * 3_600_000 : value * 86_400_000;
      const from = new Date(now.getTime() - msAgo).toISOString();

      // Xóa message chọn source, hiện loading
      try { await ctx.deleteMessage(); } catch (_) {}
      const statusMsg = await ctx.reply('⏳ Summarizing messages.');
      const frames = [
        '⏳ Summarizing messages.',
        '⏳ Summarizing messages..',
        '⏳ Summarizing messages...',
        '⌛ Summarizing messages...',
      ];
      let frameIdx = 0;
      const animInterval = setInterval(async () => {
        frameIdx = (frameIdx + 1) % frames.length;
        try {
          await ctx.telegram.editMessageText(
            statusMsg.chat.id,
            statusMsg.message_id,
            undefined,
            frames[frameIdx],
          );
        } catch (_) {}
      }, 700);

      try {
        const result = await this.digestService.summarize({ from, sourceId });

        clearInterval(animInterval);
        await ctx.telegram.deleteMessage(statusMsg.chat.id, statusMsg.message_id);

        if (result.digestsCreated === 0) {
          return ctx.reply('📭 No new messages to summarize in this period.');
        }

        for (const digest of result.digests || []) {
          await ctx.reply(
            `🟢 *${digest.sourceName}* _(last ${timeRange})_\n\n${digest.summary}`,
            { parse_mode: 'Markdown' },
          );
        }
      } catch (error) {
        clearInterval(animInterval);
        await ctx.telegram.deleteMessage(statusMsg.chat.id, statusMsg.message_id);
        this.logger.error('Error in summarize action:', error);
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
        this.userStates.set(ctx.from.id, { action: 'ask' });
        return ctx.reply('💡 Please enter your question about the collected information:', {
          reply_markup: {
            force_reply: true,
          },
        });
      }

      await this.processAskCommand(ctx, question);
    });

    // Xử lý tin nhắn tự do (không phải command) - cũng coi như câu hỏi
    this.bot.on('text', async (ctx) => {
      const text = ctx.message.text;
      const chatType = ctx.chat.type;
      const botUsername = ctx.botInfo?.username;

      // Kiểm tra trạng thái chờ nhập
      const userState = this.userStates.get(ctx.from.id);
      if (userState && userState.action === 'ask') {
        this.userStates.delete(ctx.from.id); // clear state
        return this.processAskCommand(ctx, text);
      }

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

      // Nếu chỉ tag bot mà không có nội dung → show danh sách lệnh
      if (cleanText.length === 0) {
        return ctx.reply(
          '👋 Hello! I am your Summarize AI Assistant.\n\n' +
          'Available commands:\n' +
          '/sources - View monitored sources\n' +
          '/summarize - Summarize messages (pick time range: 2h, 4h, 8h, 24h, 5d, 7d, 15d, 30d)\n' +
          '/stats - View system statistics\n' +
          '/ask <question> - Ask AI about collected information\n\n' +
          '💡 Or just mention me with a question, e.g:\n' +
          `@${botUsername || 'bot'} what is the latest oil price?`,
        );
      }

      // Bỏ qua tin nhắn quá ngắn
      if (cleanText.length < 5) return;

      await this.processAskCommand(ctx, cleanText);
    });
  }

  private async processAskCommand(ctx: any, question: string) {
    await ctx.sendChatAction('typing');
    ctx.reply('🤔 Searching and analyzing...');

    try {
      const answer = await this.answerQuestion(question, ctx.chat.id.toString());
      ctx.reply(answer, { parse_mode: 'Markdown' });
    } catch (error) {
      this.logger.error('Error processing question:', error);
      ctx.reply('❌ Error processing question.');
    }
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
            `You are an AI assistant for an Summarize. Based on the summarized data below, answer the user's question accurately and helpfully.\n\n` +
            `If no relevant information is found, clearly state that the data is not available.\n` +
            `**Language rule:** Detect the language of the user's question and respond in that SAME language. If the language cannot be determined, respond in the language of the summarized data content.\n` +
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
