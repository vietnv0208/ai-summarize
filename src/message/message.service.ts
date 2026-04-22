import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueryMessagesDto } from './dto/message.dto';

@Injectable()
export class MessageService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: QueryMessagesDto) {
    const limit = query.limit ? parseInt(query.limit, 10) : 50;

    const where: any = {};
    if (query.sourceId) {
      where.sourceId = query.sourceId;
    }
    if (query.undigested === 'true') {
      where.digestId = null;
    }

    return this.prisma.rawMessage.findMany({
      where,
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        actor: { select: { id: true, name: true, externalId: true } },
        source: { select: { id: true, name: true, platform: true } },
      },
    });
  }

  async getStats() {
    const [totalMessages, undigestedMessages, totalDigests, totalSources] =
      await Promise.all([
        this.prisma.rawMessage.count(),
        this.prisma.rawMessage.count({ where: { digestId: null } }),
        this.prisma.messageDigest.count(),
        this.prisma.source.count({ where: { isActive: true } }),
      ]);

    return {
      totalMessages,
      undigestedMessages,
      totalDigests,
      activeSources: totalSources,
    };
  }
}
