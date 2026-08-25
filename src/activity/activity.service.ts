import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  // İki koordinat arası Haversine mesafe hesabı (metre cinsinden)
  private getDistanceInMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  async getDailyActivity(userId: string, dateStr?: string) {
    const targetDate = dateStr ? new Date(dateStr) : new Date();

    // Günün başlangıç ve bitiş saatleri
    const startOfDay = new Date(targetDate);
    startOfDay.setHours(0, 0, 0, 0);

    const endOfDay = new Date(targetDate);
    endOfDay.setHours(23, 59, 59, 999);

    // Kayıtlı bir snapshot var mı?
    const existingSnapshot = await this.prisma.activitySnapshot.findUnique({
      where: {
        userId_date: {
          userId,
          date: startOfDay,
        },
      },
    });

    if (existingSnapshot) {
      return existingSnapshot;
    }

    // Yoksa o güne ait konum kayıtlarından hesapla
    const locations = await this.prisma.location.findMany({
      where: {
        userId,
        recordedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: { recordedAt: 'asc' },
    });

    let totalDistance = 0;
    for (let i = 0; i < locations.length - 1; i++) {
      const dist = this.getDistanceInMeters(
        locations[i].latitude,
        locations[i].longitude,
        locations[i + 1].latitude,
        locations[i + 1].longitude,
      );
      // Gürültüyü engellemek için 5 metreden küçük sapmaları yok sayalım
      if (dist > 5) {
        totalDistance += dist;
      }
    }

    // Aktif süre (Yürüme/Hareket hızı varsayımı: her 70 metre için 1 dakika aktif süre verelim)
    const activeMinutes = Math.round(totalDistance / 70);

    // Bugün kaç farklı yere gitti? (Örn: Kaç kez güvenli bölge alarmı tetiklendi + 1)
    const visitedZones = await this.prisma.alert.findMany({
      where: {
        userId,
        createdAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
        type: {
          in: ['safe_zone_enter', 'safe_zone_exit'],
        },
      },
    });

    // En az 1 mekan (ev/başlangıç noktası) + tetiklenen farklı güvenli bölgeler
    const uniqueVisitedZones = new Set(
      visitedZones
        .map((z) => {
          const metadata = z.metadata as { safeZoneId?: string } | null;
          return metadata?.safeZoneId;
        })
        .filter(Boolean),
    );
    const visitedPlacesCount = Math.max(1, uniqueVisitedZones.size + 1);

    // Eğer gün bitmişse (yani dünden önceki bir günse) veya konum kayıtları bulunmuşsa veritabanına kaydet
    const isToday = new Date().toDateString() === targetDate.toDateString();

    const snapshotData = {
      userId,
      date: startOfDay,
      totalDistance: Math.round(totalDistance * 100) / 100, // virgülden sonra 2 hane
      activeMinutes,
      visitedPlacesCount,
    };

    if (!isToday && locations.length > 0) {
      return this.prisma.activitySnapshot.create({
        data: snapshotData,
      });
    }

    // Bugünün verisi ise anlık hesaplayıp döndür, kaydetme (çünkü gün içinde değişebilir)
    return {
      id: 'temporary_today_snapshot',
      ...snapshotData,
      createdAt: new Date(),
    };
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
              userId: userId,
            },
          },
        },
      },
    });
    return !!common;
  }
}
