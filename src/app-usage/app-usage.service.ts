import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppUsageService {
  constructor(private prisma: PrismaService) {}

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
              userId: userId,
            },
          },
        },
      },
    });
    return !!common;
  }

  async saveAppUsage(
    userId: string,
    usages: Array<{
      packageName: string;
      appName: string;
      durationMin: number;
    }>,
    recordedDateStr?: string,
  ) {
    const startOfToday = recordedDateStr
      ? new Date(recordedDateStr)
      : new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // 1. O güne ait mevcut kayıtları tek seferde çek (select yükünü minimize et)
    const existingUsages = await this.prisma.appUsage.findMany({
      where: {
        userId,
        recordedDate: startOfToday,
      },
    });

    const existingMap = new Map(existingUsages.map((u) => [u.packageName, u]));

    const toCreate: Array<{
      userId: string;
      packageName: string;
      appName: string;
      durationMin: number;
      recordedDate: Date;
      lastUsedAt: Date;
    }> = [];

    const toUpdate: Array<{
      id: string;
      durationMin: number;
      appName: string;
    }> = [];

    // 2. Bellekte karşılaştır ve sadece değişen/yeni verileri belirle
    for (const usage of usages) {
      const existing = existingMap.get(usage.packageName);
      if (existing) {
        // Süre değiştiyse veya adı güncellendiyse listeye ekle
        if (existing.durationMin !== usage.durationMin) {
          toUpdate.push({
            id: existing.id,
            durationMin: usage.durationMin,
            appName: usage.appName,
          });
        }
      } else {
        toCreate.push({
          userId,
          packageName: usage.packageName,
          appName: usage.appName,
          durationMin: usage.durationMin,
          recordedDate: startOfToday,
          lastUsedAt: new Date(),
        });
      }
    }

    // 3. Toplu sorguları çalıştır (veritabanı transaction yükünü azalt)
    if (toCreate.length > 0) {
      await this.prisma.appUsage.createMany({
        data: toCreate,
      });
    }

    if (toUpdate.length > 0) {
      await Promise.all(
        toUpdate.map((u) =>
          this.prisma.appUsage.update({
            where: { id: u.id },
            data: {
              durationMin: u.durationMin,
              appName: u.appName,
              lastUsedAt: new Date(),
            },
          }),
        ),
      );
    }

    return { success: true };
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
