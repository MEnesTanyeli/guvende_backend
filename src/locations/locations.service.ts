import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordLocationDto } from './dto/record-location.dto';
import { LocationsGateway } from './locations.gateway';
import { AlertType, AlertStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class LocationsService {
  constructor(
    private prisma: PrismaService,
    private locationsGateway: LocationsGateway,
    private notificationsService: NotificationsService,
  ) {}

  // Mesafe hesabı için Haversine Formülü (metre cinsinden döndürür)
  private getDistanceInMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // Dünya yarıçapı (metre)
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

  async recordLocation(userId: string, dto: RecordLocationDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    // Önceki en son konumu al
    const prevLocation = await this.prisma.location.findFirst({
      where: { userId },
      orderBy: { recordedAt: 'desc' },
    });

    // Yeni konum kaydını veritabanına ekle
    const newLocation = await this.prisma.location.create({
      data: {
        userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        accuracy: dto.accuracy,
        speed: dto.speed,
        batteryLevel: dto.batteryLevel,
        isCharging: dto.isCharging ?? false,
        connectionStatus: 'online',
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
    });

    // Kullanıcının bağlantısı geri geldiği için varsa eski "connection_lost" alarmlarını çözümlenmişe çek
    await this.prisma.alert.updateMany({
      where: {
        userId,
        type: AlertType.connection_lost,
        status: AlertStatus.active,
      },
      data: {
        status: AlertStatus.resolved,
        resolvedAt: new Date(),
      },
    });

    // Kullanıcının üye olduğu aile gruplarını bul
    const memberships = await this.prisma.familyMember.findMany({
      where: { userId },
      select: { familyId: true },
    });

    // Her aile grubu için kontroller ve websocket yayını
    for (const membership of memberships) {
      const familyId = membership.familyId;

      // 1. Güvenli Bölge Giriş / Çıkış Kontrolleri
      const safeZones = await this.prisma.safeZone.findMany({
        where: { familyId },
      });

      for (const zone of safeZones) {
        const newDist = this.getDistanceInMeters(
          dto.latitude,
          dto.longitude,
          zone.latitude,
          zone.longitude,
        );

        if (prevLocation) {
          const prevDist = this.getDistanceInMeters(
            prevLocation.latitude,
            prevLocation.longitude,
            zone.latitude,
            zone.longitude,
          );

          // Giriş Senaryosu: Önceki mesafe yarıçapın dışındaydı, yeni mesafe içinde
          if (newDist <= zone.radius && prevDist > zone.radius) {
            const alertTitle = 'Güvenli Bölgeye Giriş';
            const alertMsg = `${user.name}, "${zone.name}" güvenli bölgesine giriş yaptı.`;

            await this.prisma.alert.create({
              data: {
                familyId,
                userId,
                type: AlertType.safe_zone_enter,
                title: alertTitle,
                message: alertMsg,
                metadata: { safeZoneId: zone.id, safeZoneName: zone.name },
              },
            });

            // Veli/diğer üyelere bildirim tetikle
            await this.notificationsService.sendFamilyNotification(
              familyId,
              userId,
              alertTitle,
              alertMsg,
              { type: 'safe_zone_enter', userId, zoneId: zone.id },
            );
          }

          // Çıkış Senaryosu: Önceki mesafe yarıçapın içindeydi, yeni mesafe dışında
          if (newDist > zone.radius && prevDist <= zone.radius) {
            const alertTitle = 'Güvenli Bölgeden Çıkış';
            const alertMsg = `${user.name}, "${zone.name}" güvenli bölgesinden çıkış yaptı!`;

            await this.prisma.alert.create({
              data: {
                familyId,
                userId,
                type: AlertType.safe_zone_exit,
                title: alertTitle,
                message: alertMsg,
                metadata: { safeZoneId: zone.id, safeZoneName: zone.name },
              },
            });

            // Veli/diğer üyelere bildirim tetikle
            await this.notificationsService.sendFamilyNotification(
              familyId,
              userId,
              alertTitle,
              alertMsg,
              { type: 'safe_zone_exit', userId, zoneId: zone.id },
            );
          }
        }
      }

      // 2. Canlı WebSocket Yayını
      this.locationsGateway.sendLocationUpdate(familyId, newLocation);
    }

    // 3. Düşük Şarj Kontrolleri
    if (dto.batteryLevel !== undefined) {
      if (dto.batteryLevel <= 15 && !dto.isCharging) {
        // Zaten aktif bir düşük şarj uyarısı var mı?
        const activeBatteryAlert = await this.prisma.alert.findFirst({
          where: {
            userId,
            type: AlertType.low_battery,
            status: AlertStatus.active,
          },
        });

        if (!activeBatteryAlert) {
          const alertTitle = 'Düşük Şarj Uyarısı';
          const alertMsg = `${user.name} adlı aile üyesinin şarjı %${dto.batteryLevel} seviyesine düştü!`;

          // Her üye olduğu aile grubu için ayrı ayrı alarm oluştur
          for (const membership of memberships) {
            await this.prisma.alert.create({
              data: {
                familyId: membership.familyId,
                userId,
                type: AlertType.low_battery,
                title: alertTitle,
                message: alertMsg,
                metadata: { batteryLevel: dto.batteryLevel },
              },
            });

            await this.notificationsService.sendFamilyNotification(
              membership.familyId,
              userId,
              alertTitle,
              alertMsg,
              { type: 'low_battery', userId, batteryLevel: dto.batteryLevel },
            );
          }
        }
      } else if (dto.batteryLevel > 15 || dto.isCharging) {
        // Aktif düşük şarj alarmlarını çözümlendi olarak işaretle
        await this.prisma.alert.updateMany({
          where: {
            userId,
            type: AlertType.low_battery,
            status: AlertStatus.active,
          },
          data: {
            status: AlertStatus.resolved,
            resolvedAt: new Date(),
          },
        });
      }
    }

    return newLocation;
  }

  async getLatestLocations(userId: string, familyId: string) {
    // İstek atan kullanıcının bu ailede üye olup olmadığını doğrula
    const isMember = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (!isMember) {
      throw new ForbiddenException('Bu aile grubunun konum verilerine erişim yetkiniz yok.');
    }

    // Ailedeki tüm üyeleri çek
    const members = await this.prisma.familyMember.findMany({
      where: { familyId },
      select: { userId: true },
    });

    const userIds = members.map((m) => m.userId);

    // Her üyenin en son konumunu getir
    const latestLocations = await Promise.all(
      userIds.map(async (uid) => {
        return this.prisma.location.findFirst({
          where: { userId: uid },
          orderBy: { recordedAt: 'desc' },
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
        });
      }),
    );

    return latestLocations.filter((loc) => loc !== null);
  }
}
