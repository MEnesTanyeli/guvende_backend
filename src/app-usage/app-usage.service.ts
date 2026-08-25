import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface AppUsageSnapshotItem {
  packageName: string;
  appName: string;
  durationMin: number;
}

@Injectable()
export class AppUsageService {
  constructor(private prisma: PrismaService) {}

  private getIstanbulDateKey(date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);
    const get = (type: string) =>
      parts.find((part) => part.type === type)?.value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  private getIstanbulDayStartUtc(dateStr?: string): Date {
    const dateKey =
      dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ? dateStr
        : this.getIstanbulDateKey();
    const [year, month, day] = dateKey.split('-').map(Number);
    return new Date(Date.UTC(year, month - 1, day, -3, 0, 0, 0));
  }

  async checkCommonFamily(
    userId: string,
    targetUserId: string,
  ): Promise<boolean> {
    const common = await this.prisma.familyMember.findFirst({
      where: {
        userId: targetUserId,
        family: {
          members: {
            some: {
              userId,
            },
          },
        },
      },
    });
    return !!common;
  }

  async saveAppUsage(
    userId: string,
    usages: AppUsageSnapshotItem[],
    recordedDateStr?: string,
  ) {
    const recordedDate = this.getIstanbulDayStartUtc(recordedDateStr);
    const now = new Date();
    const normalizedUsages = usages
      .map((usage) => ({
        packageName: usage.packageName.trim(),
        appName: usage.appName.trim(),
        durationMin: usage.durationMin,
      }))
      .filter(
        (usage) =>
          usage.packageName.length > 0 &&
          usage.appName.length > 0 &&
          usage.durationMin > 0,
      );

    const packageNames = normalizedUsages.map((usage) => usage.packageName);

    await this.prisma.$transaction([
      this.prisma.appUsage.deleteMany({
        where: {
          userId,
          recordedDate,
          ...(packageNames.length > 0
            ? { packageName: { notIn: packageNames } }
            : {}),
        },
      }),
      ...normalizedUsages.map((usage) =>
        this.prisma.appUsage.upsert({
          where: {
            userId_packageName_recordedDate: {
              userId,
              packageName: usage.packageName,
              recordedDate,
            },
          },
          create: {
            userId,
            packageName: usage.packageName,
            appName: usage.appName,
            durationMin: usage.durationMin,
            recordedDate,
            lastUsedAt: now,
          },
          update: {
            appName: usage.appName,
            durationMin: usage.durationMin,
            lastUsedAt: now,
          },
        }),
      ),
    ]);

    return { success: true, count: normalizedUsages.length };
  }

  async getMemberAppUsage(userId: string, targetUserId: string) {
    if (userId !== targetUserId) {
      const isShared = await this.checkCommonFamily(userId, targetUserId);
      if (!isShared) {
        throw new ForbiddenException(
          'Bu üyenin uygulama kullanım verilerini görme yetkiniz yok.',
        );
      }
    }

    return this.prisma.appUsage.findMany({
      where: {
        userId: targetUserId,
        recordedDate: this.getIstanbulDayStartUtc(),
      },
      orderBy: {
        durationMin: 'desc',
      },
    });
  }
}
