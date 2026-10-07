import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AlertStatus, MemberType, Prisma } from '@prisma/client';
import { SubscriptionEntitlementService } from '../common/subscription-entitlement.service';

@Injectable()
export class AlertsService {
  constructor(
    private prisma: PrismaService,
    private subscriptionEntitlement: SubscriptionEntitlementService,
  ) {}

  async findAll(userId: string, familyId: string) {
    // Aile grubuna üye olduğunu doğrula
    const membership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Bu aile grubunun alarmlarını görüntüleme yetkiniz yok.',
      );
    }

    if (membership.memberType !== MemberType.guardian) {
      throw new ForbiddenException(
        'Sadece veliler/koruyucular (guardian) alarmları görüntüleyebilir.',
      );
    }

    await this.subscriptionEntitlement.assertFamilyEntitled(familyId);

    return this.prisma.alert.findMany({
      where: {
        familyId,
        family: {
          members: {
            some: { userId, memberType: MemberType.guardian },
          },
        },
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async resolve(userId: string, alertId: string) {
    const guardianFamilyScope = {
      members: {
        some: { userId, memberType: MemberType.guardian },
      },
    };
    const alert = await this.prisma.alert.findFirst({
      where: {
        id: alertId,
        family: { is: guardianFamilyScope },
      },
    });

    if (!alert) {
      throw new NotFoundException('Alarm bulunamadı.');
    }

    await this.subscriptionEntitlement.assertFamilyEntitled(alert.familyId);

    try {
      return await this.prisma.alert.update({
        where: {
          id: alertId,
          family: { is: guardianFamilyScope },
        },
        data: {
          status: AlertStatus.resolved,
          resolvedAt: new Date(),
        },
      });
    } catch (error) {
      // Membership may be revoked after the scoped read; keep the resource
      // indistinguishable from a missing alert in that race.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        throw new NotFoundException('Alarm bulunamadı.');
      }
      throw error;
    }
  }

  async resolveAll(userId: string, familyId: string) {
    // Aile grubu üyeliği ve gardiyan rolünü doğrula
    const membership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException(
        'Bu aile grubunun alarmlarını çözmeye yetkiniz yok.',
      );
    }

    if (membership.memberType !== MemberType.guardian) {
      throw new ForbiddenException(
        'Sadece veliler/koruyucular (guardian) alarmları çözebilir.',
      );
    }

    await this.subscriptionEntitlement.assertFamilyEntitled(familyId);

    return this.prisma.alert.updateMany({
      where: {
        familyId,
        status: AlertStatus.active,
        family: {
          members: {
            some: { userId, memberType: MemberType.guardian },
          },
        },
      },
      data: {
        status: AlertStatus.resolved,
        resolvedAt: new Date(),
      },
    });
  }
}
