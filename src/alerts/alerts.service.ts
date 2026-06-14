import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AlertStatus, MemberType } from '@prisma/client';

@Injectable()
export class AlertsService {
  constructor(private prisma: PrismaService) {}

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
      throw new ForbiddenException('Bu aile grubunun alarmlarını görüntüleme yetkiniz yok.');
    }

    if (membership.memberType !== MemberType.guardian) {
      throw new ForbiddenException('Sadece veliler/koruyucular (guardian) alarmları görüntüleyebilir.');
    }

    return this.prisma.alert.findMany({
      where: {
        familyId,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async resolve(userId: string, alertId: string) {
    const alert = await this.prisma.alert.findUnique({
      where: { id: alertId },
    });

    if (!alert) {
      throw new NotFoundException('Alarm bulunamadı.');
    }

    // Aile grubu üyeliği ve gardiyan rolünü doğrula
    const membership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId: alert.familyId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Bu aile grubunun alarmını çözmeye yetkiniz yok.');
    }

    if (membership.memberType !== MemberType.guardian) {
      throw new ForbiddenException('Sadece veliler/koruyucular (guardian) alarmları çözebilir.');
    }

    return this.prisma.alert.update({
      where: { id: alertId },
      data: {
        status: AlertStatus.resolved,
        resolvedAt: new Date(),
      },
    });
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
      throw new ForbiddenException('Bu aile grubunun alarmlarını çözmeye yetkiniz yok.');
    }

    if (membership.memberType !== MemberType.guardian) {
      throw new ForbiddenException('Sadece veliler/koruyucular (guardian) alarmları çözebilir.');
    }

    return this.prisma.alert.updateMany({
      where: {
        familyId,
        status: AlertStatus.active,
      },
      data: {
        status: AlertStatus.resolved,
        resolvedAt: new Date(),
      },
    });
  }
}
