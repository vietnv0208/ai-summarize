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
   * Lấy tất cả các RawMessage chưa được digest trong khoảng thời gian,
   * nhóm theo sourceId, rồi gọi AI tóm tắt.
   */
  async summarize(dto: SummarizeRequestDto) {
    const now = new Date();
    const from = dto.from
      ? new Date(dto.from)
      : new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const to = dto.to ? new Date(dto.to) : now;

    // Lấy tất cả các tin nhắn trong khoảng thời gian
    const whereClause: any = {
      createdAt: { gte: from, lte: to },
    };
    if (dto.sourceId) {
      whereClause.sourceId = dto.sourceId;
    }

    const messagesToSummarize = await this.prisma.rawMessage.findMany({
      where: whereClause,
      orderBy: { createdAt: 'asc' },
      include: { actor: true, source: true },
    });

    if (messagesToSummarize.length === 0) {
      return {
        message: 'No messages found in the specified time range.',
        digestsCreated: 0,
      };
    }

    // Nhóm tin nhắn theo sourceId
    const groupedBySource = new Map<string, typeof messagesToSummarize>();
    for (const msg of messagesToSummarize) {
      const group = groupedBySource.get(msg.sourceId) || [];
      group.push(msg);
      groupedBySource.set(msg.sourceId, group);
    }

    const results: any[] = [];

    for (const [sourceId, messages] of groupedBySource) {
      // Ghép text tin nhắn thành transcript
      const transcript = messages
        .map((m) => `[${m.actor?.name || 'Unknown'}]: ${m.content}`)
        .join('\n');

      const sourceName = messages[0].source.name || sourceId;

      // Gọi AI để tóm tắt
      let aiResult;
      let status = 'success';
      try {
        aiResult = await this.aiService.summarizeConversation(
          transcript,
          sourceName,
        );
      } catch (error) {
        this.logger.error(`AI summarization failed for source ${sourceId}:`, error);
        aiResult = {
          summary: `[AI Error] Could not summarize ${messages.length} messages from ${sourceName}.`,
          entities: {},
        };
        status = 'failed_ai';
      }

      // Tạo digest record
      const digest = await this.prisma.messageDigest.create({
        data: {
          sourceId,
          timeFrom: messages[0].createdAt,
          timeTo: messages[messages.length - 1].createdAt,
          messageCount: messages.length,
          summary: aiResult.summary,
          entities: aiResult.entities || {},
          status,
        },
      });

      // Cập nhật digestId cho các tin nhắn đã xử lý
      await this.prisma.rawMessage.updateMany({
        where: { id: { in: messages.map((m) => m.id) } },
        data: { digestId: digest.id },
      });

      this.logger.log(
        `Created digest ${digest.id} for source "${sourceName}" with ${messages.length} messages`,
      );

      results.push({
        digestId: digest.id,
        sourceId,
        sourceName,
        messageCount: messages.length,
        summary: aiResult.summary,
        entities: aiResult.entities,
      });
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
