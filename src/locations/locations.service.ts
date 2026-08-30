import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordLocationDto } from './dto/record-location.dto';
import { RecordBulkLocationsDto } from './dto/record-bulk-locations.dto';
import { LocationsGateway } from './locations.gateway';
import { AlertType, MemberType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger('LocationsService');

  constructor(
    private prisma: PrismaService,
    private locationsGateway: LocationsGateway,
    private notificationsService: NotificationsService,
  ) {}

  private getIstanbulDateKey(date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Istanbul',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(date);

    const year = parts.find((part) => part.type === 'year')?.value;
    const month = parts.find((part) => part.type === 'month')?.value;
    const day = parts.find((part) => part.type === 'day')?.value;

    return `${year}-${month}-${day}`;
  }

  private getIstanbulDayRangeUtc(dateStr?: string): {
    startOfDay: Date;
    endOfDay: Date;
  } {
    const dateKey =
      dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
        ? dateStr
        : this.getIstanbulDateKey();
    const [year, month, day] = dateKey.split('-').map(Number);

    const startMs = Date.UTC(year, month - 1, day, -3, 0, 0, 0);
    const nextDayStartMs = Date.UTC(year, month - 1, day + 1, -3, 0, 0, 0);

    return {
      startOfDay: new Date(startMs),
      endOfDay: new Date(nextDayStartMs - 1),
    };
  }
  // Mesafe hesabı için Haversine Formülü (metre cinsinden döndürür)
  private getDistanceInMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
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

  private isTrackableMember(member: {
    memberType: MemberType;
    guardianTrackingEnabled: boolean;
  }): boolean {
    return (
      member.memberType === MemberType.child ||
      member.memberType === MemberType.elder ||
      member.guardianTrackingEnabled
    );
  }

  private async calculateMovementStatus(
    userId: string,
    dto: RecordLocationDto,
    prevLocation: {
      latitude: number;
      longitude: number;
      speed: number | null;
      accuracy: number | null;
      recordedAt: Date;
      movementStatus: string;
    } | null,
  ): Promise<'unknown' | 'moving' | 'stationary' | 'invalid'> {
    if (!prevLocation) return 'unknown';

    const accuracy = dto.accuracy ?? 20;
    if (!Number.isFinite(accuracy) || accuracy > 120) return 'invalid';

    const recordedAt = dto.recordedAt ? new Date(dto.recordedAt) : new Date();
    const distanceFromPrevious = this.getDistanceInMeters(
      prevLocation.latitude,
      prevLocation.longitude,
      dto.latitude,
      dto.longitude,
    );
    const elapsedSeconds = Math.max(
      0.5,
      (recordedAt.getTime() - prevLocation.recordedAt.getTime()) / 1000,
    );
    const calculatedSpeedKmh = (distanceFromPrevious / elapsedSeconds) * 3.6;

    // Match the client-side stable-position rules: reject noisy fixes and
    // require multiple consistent points before declaring movement.
    const snapThreshold = 55;
    if (accuracy > 18 || distanceFromPrevious < snapThreshold) {
      return 'stationary';
    }
    if (calculatedSpeedKmh > 180) return 'invalid';

    const recent = await this.prisma.location.findMany({
      where: { userId },
      orderBy: { recordedAt: 'desc' },
      take: 3,
      select: {
        latitude: true,
        longitude: true,
        speed: true,
        accuracy: true,
        recordedAt: true,
      },
    });
    const candidates = [
      ...recent.reverse(),
      {
        latitude: dto.latitude,
        longitude: dto.longitude,
        speed: dto.speed ?? 0,
        accuracy,
        recordedAt,
      },
    ];
    let consistentCandidates = 0;
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      const anchorDistance = this.getDistanceInMeters(
        prevLocation.latitude,
        prevLocation.longitude,
        candidate.latitude,
        candidate.longitude,
      );
      if ((candidate.accuracy ?? 20) > 18 || anchorDistance < snapThreshold) {
        consistentCandidates = 0;
        continue;
      }

      const previous = i > 0 ? candidates[i - 1] : prevLocation;
      const stepDistance = this.getDistanceInMeters(
        previous.latitude,
        previous.longitude,
        candidate.latitude,
        candidate.longitude,
      );
      const stepSeconds = Math.max(
        1,
        (candidate.recordedAt.getTime() - previous.recordedAt.getTime()) / 1000,
      );
      const stepSpeedKmh = (stepDistance / stepSeconds) * 3.6;
      const gpsSpeed = candidate.speed ?? 0;
      const maxStepDistance = Math.max(100, (180 / 3.6) * stepSeconds + 25);
      const usefulStep = stepDistance >= 5 || gpsSpeed >= 3 || calculatedSpeedKmh >= 3;

      if (stepDistance <= maxStepDistance && stepSpeedKmh <= 180 && usefulStep) {
        consistentCandidates++;
      } else {
        consistentCandidates = 0;
      }
    }

    return consistentCandidates >= 3 ? 'moving' : 'stationary';
  }

  async recordLocation(userId: string, dto: RecordLocationDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    // Konum verisinin eski (çevrimdışı gecikmeli) olup olmadığını kontrol et
    const isStale = dto.recordedAt
      ? Date.now() - new Date(dto.recordedAt).getTime() > 5 * 60 * 1000
      : false;

    // Önceki en son konumu al
    const prevLocation = await this.prisma.location.findFirst({
      where: { userId },
      orderBy: { recordedAt: 'desc' },
    });

    const recordedAt = dto.recordedAt ? new Date(dto.recordedAt) : new Date();
    const movementStatus = await this.calculateMovementStatus(
      userId,
      dto,
      prevLocation,
    );

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
        movementStatus,
        recordedAt,
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
    await this.notificationsService.resolveActiveAlerts(
      userId,
      AlertType.connection_lost,
    );

    // Kullanıcının üye olduğu aile gruplarını bul
    const memberships = await this.prisma.familyMember.findMany({
      where: { userId },
      select: {
        familyId: true,
        memberType: true,
        guardianTrackingEnabled: true,
      },
    });
    const trackableMemberships = memberships.filter((membership) =>
      this.isTrackableMember(membership),
    );

    // Her aile grubu için kontroller ve websocket yayını
    for (const membership of trackableMemberships) {
      const familyId = membership.familyId;

      // 1. Güvenli Bölge Giriş / Çıkış Kontrolleri
      const safeZones = await this.prisma.safeZone.findMany({
        where: { familyId },
      });

      // İstemciden gelen hazır bölge bilgilerini kullan, yoksa fallback olarak hesapla (geofencing optimizasyonu)
      let insideZoneName: string | null = dto.insideZoneName || null;
      let insideZoneId: string | null = dto.insideZoneId || null;

      if (!insideZoneName && safeZones.length > 0) {
        for (const zone of safeZones) {
          const newDist = this.getDistanceInMeters(
            dto.latitude,
            dto.longitude,
            zone.latitude,
            zone.longitude,
          );
          if (newDist <= zone.radius) {
            insideZoneName = zone.name;
            insideZoneId = zone.id;
            break;
          }
        }
      }

      // Önceki konumun bölge durumunu belirle
      let prevZoneId: string | null = null;
      if (prevLocation && safeZones.length > 0) {
        for (const zone of safeZones) {
          const prevDist = this.getDistanceInMeters(
            prevLocation.latitude,
            prevLocation.longitude,
            zone.latitude,
            zone.longitude,
          );
          if (prevDist <= zone.radius) {
            prevZoneId = zone.id;
            break;
          }
        }
      }

      let alertTriggered = false;

      // Giriş Senaryosu: Önceki konum bölge dışında, yeni konum içinde
      if (insideZoneId && prevZoneId !== insideZoneId) {
        const zone = safeZones.find((z) => z.id === insideZoneId);
        if (zone) {
          const alertTitle = 'Güvenli Bölgeye Giriş';
          const alertMsg = `${user.name}, "${zone.name}" güvenli bölgesine giriş yaptı.`;

          await this.notificationsService.raiseFamilyAlert({
            familyId,
            userId,
            type: AlertType.safe_zone_enter,
            title: alertTitle,
            message: alertMsg,
            metadata: { safeZoneId: zone.id, safeZoneName: zone.name },
            notificationData: {
              type: 'safe_zone_enter',
              userId,
              zoneId: zone.id,
            },
            delivery: isStale ? 'none' : 'family',
          });

          alertTriggered = true;
        }
      }

      // Çıkış Senaryosu: Önceki konum bölge içinde, yeni konum dışında
      if (prevZoneId && insideZoneId !== prevZoneId) {
        const zone = safeZones.find((z) => z.id === prevZoneId);
        if (zone) {
          // Drift Guard: Sıçramaları önlemek için çıkışın doğrulanması
          let confirmExit = true;
          if (!isStale) {
            const recentLocations = await this.prisma.location.findMany({
              where: { userId },
              orderBy: { recordedAt: 'desc' },
              take: 3,
            });

            if (recentLocations.length >= 3) {
              const insidePoints = recentLocations.filter((loc) => {
                const dist = this.getDistanceInMeters(
                  loc.latitude,
                  loc.longitude,
                  zone.latitude,
                  zone.longitude,
                );
                return dist <= zone.radius;
              });
              if (insidePoints.length > 0) {
                confirmExit = false;
                this.logger.log(
                  `Geofence çıkışı doğrulanmadı (Drift Guard). Son 3 konumdan ${insidePoints.length} tanesi hala bölge içinde.`,
                );
              }
            }
          }

          if (confirmExit) {
            const alertTitle = 'Güvenli Bölgeden Çıkış';
            const alertMsg = `${user.name}, "${zone.name}" güvenli bölgesinden çıkış yaptı!`;

            await this.notificationsService.raiseFamilyAlert({
              familyId,
              userId,
              type: AlertType.safe_zone_exit,
              title: alertTitle,
              message: alertMsg,
              metadata: { safeZoneId: zone.id, safeZoneName: zone.name },
              notificationData: {
                type: 'safe_zone_exit',
                userId,
                zoneId: zone.id,
              },
              delivery: isStale ? 'none' : 'family',
            });

            alertTriggered = true;
          }
        }
      }

      // Son Durum Karşılaştırması (Zaman Aşımlı/Gecikmeli Bildirim Tetikleyici)
      // Eğer konum güncelse ve normal akışta yeni bir alarm tetiklenmediyse
      if (!isStale && !alertTriggered) {
        const lastGeofenceAlert = await this.prisma.alert.findFirst({
          where: {
            userId,
            familyId,
            type: { in: [AlertType.safe_zone_enter, AlertType.safe_zone_exit] },
          },
          orderBy: { createdAt: 'desc' },
        });

        // Velinin bildiği son durum bir bölgenin içindeydi, ama çocuk şu an dışarıda
        if (
          lastGeofenceAlert?.type === AlertType.safe_zone_enter &&
          !insideZoneId
        ) {
          const lastMetadata = lastGeofenceAlert.metadata as {
            safeZoneName?: string;
            safeZoneId?: string;
          } | null;
          const lastZoneName = lastMetadata?.safeZoneName ?? 'Güvenli Bölge';
          const lastZoneId = lastMetadata?.safeZoneId ?? null;

          const alertTitle = 'Güvenli Bölgeden Çıkış';
          const alertMsg = `${user.name}, "${lastZoneName}" güvenli bölgesinden çıkış yaptı!`;

          await this.notificationsService.raiseFamilyAlert({
            familyId,
            userId,
            type: AlertType.safe_zone_exit,
            title: alertTitle,
            message: alertMsg,
            metadata: {
              safeZoneId: lastZoneId,
              safeZoneName: lastZoneName,
              delayedTrigger: true,
            },
            notificationData: {
              type: 'safe_zone_exit',
              userId,
              zoneId: lastZoneId,
            },
          });
        }
        // Velinin bildiği son durum dışarıdaydı (veya yoktu), ama çocuk şu an bir bölgenin içinde
        else if (
          (!lastGeofenceAlert ||
            lastGeofenceAlert.type === AlertType.safe_zone_exit) &&
          insideZoneId
        ) {
          const zone = safeZones.find((z) => z.id === insideZoneId);
          if (zone) {
            const alertTitle = 'Güvenli Bölgeye Giriş';
            const alertMsg = `${user.name}, "${zone.name}" güvenli bölgesine giriş yaptı.`;

            await this.notificationsService.raiseFamilyAlert({
              familyId,
              userId,
              type: AlertType.safe_zone_enter,
              title: alertTitle,
              message: alertMsg,
              metadata: {
                safeZoneId: zone.id,
                safeZoneName: zone.name,
                delayedTrigger: true,
              },
              notificationData: {
                type: 'safe_zone_enter',
                userId,
                zoneId: zone.id,
              },
            });
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
        const alertTitle = 'Dusuk Sarj Uyarisi';
        const alertMsg = `${user.name} adli aile uyesinin sarji %${dto.batteryLevel} seviyesine dustu!`;

        await this.notificationsService.raiseUserAlertForFamilies({
          familyIds: trackableMemberships.map(
            (membership) => membership.familyId,
          ),
          userId,
          type: AlertType.low_battery,
          title: alertTitle,
          message: alertMsg,
          metadata: { batteryLevel: dto.batteryLevel },
          notificationData: {
            type: 'low_battery',
            userId,
            batteryLevel: dto.batteryLevel,
          },
          delivery: isStale ? 'none' : 'family',
          dedupeActiveByUser: true,
        });
      } else if (dto.batteryLevel > 15 || dto.isCharging) {
        await this.notificationsService.resolveActiveAlerts(
          userId,
          AlertType.low_battery,
        );
      }
    }

    return newLocation;
  }

  async recordBulkLocations(userId: string, dto: RecordBulkLocationsDto) {
    const { locations } = dto;
    if (!locations || locations.length === 0) {
      return { success: true, count: 0 };
    }

    // 1. Konumları tarihlerine göre eskiden yeniye doğru sıralayalım
    const sortedLocations = [...locations].sort((a, b) => {
      const timeA = a.recordedAt ? new Date(a.recordedAt).getTime() : 0;
      const timeB = b.recordedAt ? new Date(b.recordedAt).getTime() : 0;
      return timeA - timeB;
    });

    // 2. En son (en güncel) konumu ayıralım, diğerlerini geçmiş veri yapalım
    const latestLocationDto = sortedLocations[sortedLocations.length - 1];
    const historicalLocationDtos = sortedLocations.slice(
      0,
      sortedLocations.length - 1,
    );

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    // 3. Geçmiş konumları toplu olarak veritabanına ekleyelim (Prisma createMany ile çok hızlı)
    if (historicalLocationDtos.length > 0) {
      const dataToInsert = historicalLocationDtos.map((loc) => ({
        userId,
        latitude: loc.latitude,
        longitude: loc.longitude,
        accuracy: loc.accuracy,
        speed: loc.speed,
        batteryLevel: loc.batteryLevel,
        isCharging: loc.isCharging ?? false,
        connectionStatus: loc.connectionStatus || 'offline',
        recordedAt: loc.recordedAt ? new Date(loc.recordedAt) : new Date(),
      }));

      await this.prisma.location.createMany({
        data: dataToInsert,
      });
    }

    // 4. En güncel konumu mevcut recordLocation metoduyla işleyelim.
    // Bu sayede en son duruma göre gerekli tüm canlı bildirim ve WebSocket işlemleri tetiklenmiş olur.
    const savedLatestLocation = await this.recordLocation(
      userId,
      latestLocationDto,
    );

    return {
      success: true,
      count: locations.length,
      latestLocation: savedLatestLocation,
    };
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
      throw new ForbiddenException(
        'Bu aile grubunun konum verilerine erişim yetkiniz yok.',
      );
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
      where: {
        familyId,
        OR: [
          { userId },
          { memberType: { in: [MemberType.child, MemberType.elder] } },
          {
            memberType: MemberType.guardian,
            guardianTrackingEnabled: true,
          },
        ],
      },
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

  async getLocationsHistory(
    userId: string,
    familyId: string,
    targetUserId: string,
    dateStr?: string,
  ) {
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
      throw new ForbiddenException(
        'Bu aile grubunun verilerine erişim yetkiniz yok.',
      );
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
      throw new NotFoundException(
        'Hedef kullanıcı bu aile grubunda bulunamadı.',
      );
    }

    if (
      userId !== targetUserId &&
      (isMember.memberType !== MemberType.guardian ||
        !this.isTrackableMember(targetMember))
    ) {
      throw new ForbiddenException(
        'Bu uyenin takip verilerine erisim yetkiniz yok.',
      );
    }

    // Tarih araligini Turkiye gunune gore UTC olarak belirle.
    const { startOfDay, endOfDay } = this.getIstanbulDayRangeUtc(dateStr);

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
      throw new ForbiddenException(
        'Bu üyeye sesli uyarı gönderme yetkiniz yok.',
      );
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
      },
    );

    return {
      success: true,
      message: 'Sesli uyarı push bildirim olarak gönderildi.',
    };
  }

  async ackAudibleWarning(
    childId: string,
    senderId: string,
    action: 'received' | 'muted' | 'unanswered',
  ) {
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

      await this.notificationsService.raiseFamilyAlert({
        familyId: sharedMembership.familyId,
        userId: childId,
        type: AlertType.sos,
        title: alertTitle,
        message: alertMsg,
        metadata: { senderId },
        notificationData: { action: 'audible_warning_unanswered', childId },
      });
    }

    return { success: true };
  }

  async deleteTodayLocations(
    userId: string,
    familyId: string,
    targetUserId: string,
  ) {
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
      throw new ForbiddenException(
        'Bu aile grubunun verilerine erişim yetkiniz yok.',
      );
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
      throw new NotFoundException(
        'Hedef kullanıcı bu aile grubunda bulunamadı.',
      );
    }

    const { startOfDay, endOfDay } = this.getIstanbulDayRangeUtc();

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

  async triggerTestLocationEvent(
    userId: string,
    familyId: string,
    targetUserId: string,
  ) {
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
      throw new NotFoundException(
        'Hedef kullanıcı bu aile grubunda bulunamadı.',
      );
    }

    return { success: true };
  }
}
