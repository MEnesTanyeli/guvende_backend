import { Injectable, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordLocationDto } from './dto/record-location.dto';
import { LocationsGateway } from './locations.gateway';
import { AlertType, AlertStatus, MemberType } from '@prisma/client';
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
        connectionStatus: dto.connectionStatus || 'online',
        recordedAt: dto.recordedAt ? new Date(dto.recordedAt) : new Date(),
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
      
      let insideZoneName: string | null = null;

      for (const zone of safeZones) {
        const newDist = this.getDistanceInMeters(
          dto.latitude,
          dto.longitude,
          zone.latitude,
          zone.longitude,
        );

        if (newDist <= zone.radius) {
          insideZoneName = zone.name;
        }

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

      // 2. Canlı WebSocket Yayını (Bölge adıyla birlikte)
      const broadcastData = {
        ...newLocation,
        insideZoneName,
      };
      this.locationsGateway.sendLocationUpdate(familyId, broadcastData);
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

    const safeZones = await this.prisma.safeZone.findMany({
      where: { familyId },
    });

    // Eğer istek atan üye guardian (veli) değilse, diğerlerinin konumuna erişemez, sadece kendi konumunu görebilir.
    if (isMember.memberType !== MemberType.guardian) {
      const myLocation = await this.prisma.location.findFirst({
        where: { userId },
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

      if (!myLocation) return [];

      let insideZoneName: string | null = null;
      for (const zone of safeZones) {
        const dist = this.getDistanceInMeters(
          myLocation.latitude,
          myLocation.longitude,
          zone.latitude,
          zone.longitude,
        );
        if (dist <= zone.radius) {
          insideZoneName = zone.name;
          break;
        }
      }

      return [{ ...myLocation, insideZoneName }];
    }

    // Ailedeki tüm üyeleri çek
    const members = await this.prisma.familyMember.findMany({
      where: { familyId },
      select: { userId: true },
    });

    const userIds = members.map((m) => m.userId);

    // Her üyenin en son konumunu getir ve hangi güvenli bölgede olduğunu hesapla
    const latestLocations = await Promise.all(
      userIds.map(async (uid) => {
        const loc = await this.prisma.location.findFirst({
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

        if (!loc) return null;

        let insideZoneName: string | null = null;
        for (const zone of safeZones) {
          const dist = this.getDistanceInMeters(
            loc.latitude,
            loc.longitude,
            zone.latitude,
            zone.longitude,
          );
          if (dist <= zone.radius) {
            insideZoneName = zone.name;
            break;
          }
        }

        return { ...loc, insideZoneName };
      }),
    );

    return latestLocations.filter((loc) => loc !== null);
  }

  async getLocationsHistory(userId: string, familyId: string, targetUserId: string, dateStr?: string) {
    // Ailede üyelik kontrolü
    const isMember = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (!isMember) {
      throw new ForbiddenException('Bu aile grubunun verilerine erişim yetkiniz yok.');
    }

    // Hedef kullanıcının ailede üye olup olmadığı kontrolü
    const targetMember = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMember) {
      throw new NotFoundException('Hedef kullanıcı bu aile grubunda bulunamadı.');
    }

    // Tarih aralığını belirle
    const date = dateStr ? new Date(dateStr) : new Date();
    const startOfDay = new Date(date.setHours(0, 0, 0, 0));
    const endOfDay = new Date(date.setHours(23, 59, 59, 999));

    return this.prisma.location.findMany({
      where: {
        userId: targetUserId,
        recordedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
      orderBy: {
        recordedAt: 'asc',
      },
      select: {
        id: true,
        latitude: true,
        longitude: true,
        recordedAt: true,
        batteryLevel: true,
        speed: true,
      },
    });
  }

  async sendAudibleWarning(senderId: string, targetUserId: string) {
    if (!targetUserId) {
      throw new NotFoundException('Hedef kullanıcı belirtilmedi.');
    }

    // Yetki kontrolü: Gönderen kişi hedef kişinin bulunduğu bir grupta "veli" mi?
    const isAuthorized = await this.prisma.familyMember.findFirst({
      where: {
        userId: senderId,
        memberType: MemberType.guardian,
        family: {
          members: {
            some: {
              userId: targetUserId,
            },
          },
        },
      },
    });

    if (!isAuthorized) {
      throw new ForbiddenException('Bu üyeye sesli uyarı gönderme yetkiniz yok.');
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { name: true },
    });

    // Sadece OneSignal üzerinden push bildirim gönder
    await this.notificationsService.sendOneSignalNotification(
      [targetUserId],
      '🚨 ACİL SESLİ UYARI!',
      `${sender?.name || 'Veliniz'} size sesli uyarı gönderdi!`,
      {
        action: 'play_warning_sound',
        senderName: sender?.name || 'Veliniz',
        senderId,
      }
    );

    return { success: true, message: 'Sesli uyarı push bildirim olarak gönderildi.' };
  }

  async ackAudibleWarning(childId: string, senderId: string, action: 'received' | 'muted' | 'unanswered') {
    const child = await this.prisma.user.findUnique({
      where: { id: childId },
      select: { name: true },
    });

    // İkisinin de içinde bulunduğu ortak aile grubunu bulalım
    const sharedMembership = await this.prisma.familyMember.findFirst({
      where: {
        userId: childId,
        family: {
          members: {
            some: {
              userId: senderId,
            },
          },
        },
      },
      select: {
        familyId: true,
      },
    });

    // Veliye (senderId) soket üzerinden uyarının durumunu bildir
    this.locationsGateway.sendEventToUser(senderId, 'audible_warning_status', {
      childId,
      childName: child?.name || 'Çocuğunuz',
      status: action, // 'received', 'muted' veya 'unanswered'
      deliveredAt: new Date(),
    });

    if (action === 'unanswered' && sharedMembership) {
      const alertTitle = '⚠️ Sesli Uyarı Yanıtsız Kaldı!';
      const alertMsg = `${child?.name || 'Çocuğunuz'} gönderilen acil sesli uyarıyı 60 saniye boyunca kapatmadı! Acil durum olabilir.`;

      await this.prisma.alert.create({
        data: {
          familyId: sharedMembership.familyId,
          userId: childId,
          type: 'sos',
          title: alertTitle,
          message: alertMsg,
          metadata: { senderId },
        },
      });

      // Ailedeki tüm velilere push bildirim gönder
      await this.notificationsService.sendFamilyNotification(
        sharedMembership.familyId,
        childId,
        alertTitle,
        alertMsg,
        { action: 'audible_warning_unanswered', childId }
      );
    }

    return { success: true };
  }

  async deleteTodayLocations(userId: string, familyId: string, targetUserId: string) {
    // Ailede üyelik kontrolü
    const isMember = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (!isMember) {
      throw new ForbiddenException('Bu aile grubunun verilerine erişim yetkiniz yok.');
    }

    // Hedef kullanıcının ailede üye olup olmadığı kontrolü
    const targetMember = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMember) {
      throw new NotFoundException('Hedef kullanıcı bu aile grubunda bulunamadı.');
    }

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.location.deleteMany({
      where: {
        userId: targetUserId,
        recordedAt: {
          gte: startOfDay,
          lte: endOfDay,
        },
      },
    });
  }

  async triggerTestLocationEvent(userId: string, familyId: string, targetUserId: string) {
    // Ailede üyelik kontrolü
    const isMember = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (!isMember || isMember.memberType !== 'guardian') {
      throw new ForbiddenException('Bu işlem için veli yetkisi gereklidir.');
    }

    // Hedef kullanıcının ailede üye olup olmadığı kontrolü
    const targetMember = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMember) {
      throw new NotFoundException('Hedef kullanıcı bu aile grubunda bulunamadı.');
    }

    return { success: true };
  }
}

