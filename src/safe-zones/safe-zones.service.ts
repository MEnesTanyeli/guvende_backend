import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSafeZoneDto } from './dto/create-safe-zone.dto';
import { MemberType } from '@prisma/client';

@Injectable()
export class SafeZonesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, familyId: string, dto: CreateSafeZoneDto) {
    // Aile grubuna üyelik kontrolü
    const membership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Bu aile grubuna erişim yetkiniz yok.');
    }

    // Sadece koruyucular (guardian) güvenli bölge ekleyebilir
    if (membership.memberType !== MemberType.guardian) {
      throw new ForbiddenException('Güvenli bölge eklemek için koruyucu (guardian) olmalısınız.');
    }

    return this.prisma.safeZone.create({
      data: {
        familyId,
        name: dto.name,
        latitude: dto.latitude,
        longitude: dto.longitude,
        radius: dto.radius,
        createdBy: userId,
      },
    });
  }

  async findAll(userId: string, familyId: string) {
    const membership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Bu aile grubuna erişim yetkiniz yok.');
    }

    return this.prisma.safeZone.findMany({
      where: {
        familyId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async remove(userId: string, safeZoneId: string) {
    const safeZone = await this.prisma.safeZone.findUnique({
      where: { id: safeZoneId },
    });

    if (!safeZone) {
      throw new NotFoundException('Güvenli bölge bulunamadı.');
    }

    const membership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId: safeZone.familyId,
          userId,
        },
      },
    });

    if (!membership || membership.memberType !== MemberType.guardian) {
      throw new ForbiddenException('Bu güvenli bölgeyi silmek için yetkiniz yok.');
    }

    await this.prisma.safeZone.delete({
      where: { id: safeZoneId },
    });

    return { message: 'Güvenli bölge başarıyla silindi.' };
  }
}
