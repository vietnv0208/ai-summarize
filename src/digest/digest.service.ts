import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AiService } from '../ai/ai.service';
import { SummarizeRequestDto } from './dto/digest.dto';

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiService: AiService,
  ) {}

  /**
   * Gom nhóm các tin nhắn chưa xử lý thành một MessageDigest
   * Chạy định kỳ mỗi phút
   */
  async groupIdleMessages() {
    // Lấy các tin nhắn chưa được gom nhóm
    const pendingMessages = await this.prisma.rawMessage.findMany({
      where: { digestId: null },
      orderBy: { createdAt: 'asc' },
      include: { actor: true, source: true },
    });

    if (pendingMessages.length === 0) return 0;

    // Nhóm theo sourceId
    const groupedBySource = new Map<string, typeof pendingMessages>();
    for (const msg of pendingMessages) {
      const group = groupedBySource.get(msg.sourceId) || [];
      group.push(msg);
      groupedBySource.set(msg.sourceId, group);
    }

    let digestsCreated = 0;
    const now = new Date();

    for (const [sourceId, messages] of groupedBySource) {
      const source = messages[0].source;
      const config = source.config as any;
      const debounceSeconds = config?.debounceSeconds || 120; // Default 120s

      const lastMessage = messages[messages.length - 1];
      const diffSeconds = (now.getTime() - lastMessage.createdAt.getTime()) / 1000;

      // Nếu đã quá thời gian debounce kể từ tin nhắn cuối cùng -> gộp nhóm
      if (diffSeconds >= debounceSeconds) {
        // Gom nội dung thành 1 khối text
        const transcript = messages
          .map((m) => `[${m.actor?.name || 'Unknown'}]: ${m.content}`)
          .join('\n');

        // Lưu vào MessageDigest (sử dụng trường summary để lưu text gộp)
        const digest = await this.prisma.messageDigest.create({
          data: {
            sourceId,
            timeFrom: messages[0].createdAt,
            timeTo: lastMessage.createdAt,
            messageCount: messages.length,
            summary: transcript,
            status: 'grouped',
          },
        });

        // Cập nhật digestId cho các tin nhắn đã gộp
        await this.prisma.rawMessage.updateMany({
          where: { id: { in: messages.map((m) => m.id) } },
          data: { digestId: digest.id },
        });

        this.logger.log(
          `Grouped ${messages.length} messages into digest ${digest.id} for source "${source.name}"`,
        );
        digestsCreated++;
      }
    }

    return digestsCreated;
  }

  /**
   * Tóm tắt toàn bộ tin nhắn trong một khoảng thời gian
   * Bao gồm các MessageDigest (khối tin nhắn đã gộp) và RawMessage (các tin nhắn lẻ tẻ mới)
   */
  async summarize(dto: SummarizeRequestDto) {
    const now = new Date();
    const from = dto.from
      ? new Date(dto.from)
      : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const to = dto.to ? new Date(dto.to) : now;

    const whereClause: any = { isActive: true };
    if (dto.sourceId) {
      whereClause.id = dto.sourceId;
    }

    const sources = await this.prisma.source.findMany({ where: whereClause });
    const results: any[] = [];

    for (const source of sources) {
      // 1. Lấy các MessageDigest đã gộp trong thời gian này
      const digests = await this.prisma.messageDigest.findMany({
        where: {
          sourceId: source.id,
          timeFrom: { gte: from },
          timeTo: { lte: to },
        },
        orderBy: { timeFrom: 'asc' },
      });

      // 2. Lấy các tin nhắn lẻ tẻ chưa kịp gộp (digestId = null)
      const rawMessages = await this.prisma.rawMessage.findMany({
        where: {
          sourceId: source.id,
          digestId: null,
          createdAt: { gte: from, lte: to },
        },
        orderBy: { createdAt: 'asc' },
        include: { actor: true },
      });

      if (digests.length === 0 && rawMessages.length === 0) {
        continue;
      }

      let transcriptParts: string[] = [];
      let totalMessages = 0;

      // Đưa các khối đã gộp vào trước
      if (digests.length > 0) {
        transcriptParts.push(...digests.map((d) => d.summary));
        totalMessages += digests.reduce((sum, d) => sum + d.messageCount, 0);
      }

      // Đưa tin nhắn lẻ tẻ vào sau
      if (rawMessages.length > 0) {
        const rawTranscript = rawMessages
          .map((m) => `[${m.actor?.name || 'Unknown'}]: ${m.content}`)
          .join('\n');
        transcriptParts.push(rawTranscript);
        totalMessages += rawMessages.length;
      }

      const fullTranscript = transcriptParts.join('\n\n---\n\n');
      const sourceName = source.name || source.id;

      // Gọi AI để tóm tắt tổng thể
      let aiResult;
      try {
        aiResult = await this.aiService.summarizeConversation(
          fullTranscript,
          sourceName,
        );
        
        results.push({
          sourceId: source.id,
          sourceName,
          messageCount: totalMessages,
          summary: aiResult.summary,
          entities: aiResult.entities,
        });
      } catch (error) {
        this.logger.error(`AI summarization failed for source ${source.id}:`, error);
        results.push({
          sourceId: source.id,
          sourceName,
          messageCount: totalMessages,
          summary: `[AI Error] Could not summarize messages.`,
          entities: {},
        });
      }
    }

    return {
      message: `Successfully generated ${results.length} summaries.`,
      digestsCreated: results.length,
      digests: results,
    };
  }

  /**
   * Liệt kê tất cả digest (mới nhất trước)
   */
  async findAll(limit = 20) {
    return this.prisma.messageDigest.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        source: { select: { id: true, name: true, platform: true } },
        _count: { select: { messages: true } },
      },
    });
  }

  /**
   * Xem chi tiết 1 digest kèm toàn bộ tin nhắn gốc
   */
  async findOne(id: string) {
    return this.prisma.messageDigest.findUniqueOrThrow({
      where: { id },
      include: {
        source: true,
        messages: {
          orderBy: { createdAt: 'asc' },
          include: { actor: { select: { id: true, name: true } } },
        },
      },
    });
  }
}
