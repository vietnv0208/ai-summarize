import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSourceDto, UpdateSourceDto } from './dto/source.dto';

@Injectable()
export class SourceService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateSourceDto) {
    return this.prisma.source.create({
      data: {
        platform: dto.platform,
        externalId: dto.externalId,
        name: dto.name,
        config: dto.config ?? undefined,
      },
    });
  }

  async findAll() {
    return this.prisma.source.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: {
          select: { messages: true, digests: true },
        },
      },
    });
  }

  async findOne(id: string) {
    const source = await this.prisma.source.findUnique({
      where: { id },
      include: {
        _count: {
          select: { messages: true, digests: true, actors: true },
        },
      },
    });
    if (!source) {
      throw new NotFoundException(`Source with ID "${id}" not found`);
    }
    return source;
  }

  async update(id: string, dto: UpdateSourceDto) {
    await this.findOne(id); // ensure exists
    return this.prisma.source.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id); // ensure exists
    return this.prisma.source.delete({ where: { id } });
  }
}
