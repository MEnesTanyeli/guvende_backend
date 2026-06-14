import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppUsageService {
  constructor(private prisma: PrismaService) {}

  async checkCommonFamily(userId: string, targetUserId: string): Promise<boolean> {
    const common = await this.prisma.familyMember.findFirst({
      where: {
        userId: targetUserId,
        family: {
          members: {
            some: {
              userId: userId,
            },
          },
        },
      },
    });
    return !!common;
  }

  async saveAppUsage(userId: string, usages: Array<{ packageName: string; appName: string; durationMin: number }>) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const promises = usages.map((usage) => {
      return this.prisma.appUsage.upsert({
        where: {
          userId_packageName_recordedDate: {
            userId,
            packageName: usage.packageName,
            recordedDate: startOfToday,
          },
        },
        update: {
          durationMin: usage.durationMin,
          appName: usage.appName,
          lastUsedAt: new Date(),
        },
        create: {
          userId,
          packageName: usage.packageName,
          appName: usage.appName,
          durationMin: usage.durationMin,
          recordedDate: startOfToday,
          lastUsedAt: new Date(),
        },
      });
    });

    await Promise.all(promises);
    return { success: true };
  }

  async getMemberAppUsage(userId: string, targetUserId: string) {
    if (userId !== targetUserId) {
      const isShared = await this.checkCommonFamily(userId, targetUserId);
      if (!isShared) {
        throw new ForbiddenException('Bu üyenin uygulama kullanım verilerini görme yetkiniz yok.');
      }
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    return this.prisma.appUsage.findMany({
      where: {
        userId: targetUserId,
        recordedDate: startOfToday,
      },
      orderBy: {
        durationMin: 'desc',
      },
    });
  }
}
