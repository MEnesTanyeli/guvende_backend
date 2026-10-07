import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSafeZoneDto } from './dto/create-safe-zone.dto';
import { MemberType } from '@prisma/client';
import { SubscriptionEntitlementService } from '../common/subscription-entitlement.service';
import { FamilyMembershipLockService } from '../common/family-membership-lock.service';

@Injectable()
export class SafeZonesService {
  constructor(
    private prisma: PrismaService,
    private subscriptionEntitlement: SubscriptionEntitlementService,
    private familyMembershipLock: FamilyMembershipLockService = new FamilyMembershipLockService(),
  ) {}

  async create(userId: string, familyId: string, dto: CreateSafeZoneDto) {
    return this.prisma.$transaction(async (tx) => {
      await this.familyMembershipLock.lockFamilyMembership(tx, familyId);

      const membership = await tx.familyMember.findUnique({
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

      if (membership.memberType !== MemberType.guardian) {
        throw new ForbiddenException(
          'Güvenli bölge eklemek için koruyucu (guardian) olmalısınız.',
        );
      }

      await this.subscriptionEntitlement.assertFamilyEntitled(familyId, tx);

      return tx.safeZone.create({
        data: {
          familyId,
          name: dto.name,
          latitude: dto.latitude,
          longitude: dto.longitude,
          radius: dto.radius,
          createdBy: userId,
        },
      });
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

    if (membership.memberType !== MemberType.guardian) {
      throw new ForbiddenException(
        'Guvenli bolgeleri sadece koruyucu (guardian) uyeler goruntuleyebilir.',
      );
    }

    await this.subscriptionEntitlement.assertFamilyEntitled(familyId);

    return this.prisma.safeZone.findMany({
      where: {
        familyId,
        family: {
          members: {
            some: { userId, memberType: MemberType.guardian },
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async remove(userId: string, safeZoneId: string) {
    const guardianFamilyScope = {
      members: {
        some: { userId, memberType: MemberType.guardian },
      },
    };
    const safeZone = await this.prisma.safeZone.findFirst({
      where: {
        id: safeZoneId,
        family: { is: guardianFamilyScope },
      },
    });

    if (!safeZone) {
      throw new NotFoundException('Güvenli bölge bulunamadı.');
    }

    await this.subscriptionEntitlement.assertFamilyEntitled(safeZone.familyId);

    const deleted = await this.prisma.safeZone.deleteMany({
      where: {
        id: safeZoneId,
        family: { is: guardianFamilyScope },
      },
    });
    if (deleted.count === 0) {
      throw new NotFoundException('Güvenli bölge bulunamadı.');
    }

    return { message: 'Güvenli bölge başarıyla silindi.' };
  }
}
