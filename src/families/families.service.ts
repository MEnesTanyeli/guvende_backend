import { ForbiddenException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { JoinFamilyDto } from './dto/join-family.dto';
import { MemberType } from '@prisma/client';

@Injectable()
export class FamiliesService {
  constructor(private prisma: PrismaService) {}

  async create(userId: string, dto: CreateFamilyDto) {
    // Aile kaydını oluştur ve oluşturanı otomatik olarak guardian (veli/koruyucu) olarak ekle
    return this.prisma.$transaction(async (tx) => {
      const family = await tx.family.create({
        data: {
          name: dto.name,
          ownerId: userId,
        },
      });

      await tx.familyMember.create({
        data: {
          familyId: family.id,
          userId: userId,
          memberType: MemberType.guardian,
          permissions: ['owner', 'all'],
        },
      });

      return family;
    });
  }

  async findAll(userId: string) {
    // Kullanıcının üyesi olduğu tüm aileleri getir
    return this.prisma.family.findMany({
      where: {
        members: {
          some: {
            userId: userId,
          },
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        _count: {
          select: { members: true },
        },
      },
    });
  }

  async findOne(userId: string, familyId: string) {
    // Kullanıcının bu aile grubuna üye olup olmadığını doğrula
    const isMember = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (!isMember) {
      throw new ForbiddenException('Bu aile grubunun verilerine erişim izniniz yok.');
    }

    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
              },
            },
          },
        },
        safeZones: true,
      },
    });

    if (!family) {
      throw new NotFoundException('Aile grubu bulunamadı.');
    }

    return family;
  }

  async invite(userId: string, familyId: string) {
    // Sadece veliler/koruyucular (guardian) davet kodu alabilir
    const membership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Bu aile grubuna erişim izniniz yok.');
    }

    if (membership.memberType !== MemberType.guardian) {
      throw new ForbiddenException('Sadece koruyucu (guardian) üyeler davet kodu oluşturabilir.');
    }

    return {
      familyId,
      inviteCode: familyId,
      message: 'Bu kodu diğer üyelerle paylaşarak aileye katılmalarını sağlayabilirsiniz.',
    };
  }

  async join(userId: string, dto: JoinFamilyDto) {
    const family = await this.prisma.family.findUnique({
      where: { id: dto.familyId },
    });

    if (!family) {
      throw new NotFoundException('Geçersiz aile davet kodu.');
    }

    const existingMember = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId: dto.familyId,
          userId,
        },
      },
    });

    if (existingMember) {
      throw new ConflictException('Zaten bu aile grubunun bir üyesisiniz.');
    }

    return this.prisma.familyMember.create({
      data: {
        familyId: dto.familyId,
        userId: userId,
        memberType: dto.memberType || MemberType.child,
        permissions: [],
      },
      include: {
        family: {
          select: {
            name: true,
          },
        },
      },
    });
  }
}
