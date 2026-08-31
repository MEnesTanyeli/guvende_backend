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
import { AlertType, Location, MemberType, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

type MovementLocation = Pick<
  Location,
  'latitude' | 'longitude' | 'speed' | 'accuracy' | 'recordedAt' | 'movementStatus'
>;

@Injectable()
export class LocationsService {
  private readonly logger = new Logger('LocationsService');

  constructor(
    private prisma: PrismaService,
    private locationsGateway: LocationsGateway,
    private notificationsService: NotificationsService,
  ) {}

  private formatGeofenceEventMessage(
    userName: string,
    zoneName: string,
    action: 'giriş yaptı' | 'çıkış yaptı',
    recordedAt: Date,
    delayed: boolean,
  ): string {
    const locationText = action === 'giriş yaptı' ? 'güvenli bölgesine' : 'güvenli bölgesinden';

    if (!delayed) {
      return `${userName}, "${zoneName}" ${locationText} ${action}.`;
    }

    const eventTime = new Intl.DateTimeFormat('tr-TR', {
      timeZone: 'Europe/Istanbul',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(recordedAt);

    return `${userName}, saat ${eventTime}'de "${zoneName}" ${locationText} ${action}. Bildirim internet bağlantısı geldikten sonra iletildi.`;
  }

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

  private getGeofenceToleranceRadius(radius: number): number {
    return radius * 1.2;
  }

  private getBearingFromZoneCenter(
    zoneLatitude: number,
    zoneLongitude: number,
    pointLatitude: number,
    pointLongitude: number,
  ): number {
    const y = Math.sin((pointLongitude - zoneLongitude) * (Math.PI / 180));
    const x =
      Math.cos(zoneLatitude * (Math.PI / 180)) *
      Math.tan(pointLatitude * (Math.PI / 180)) -
      Math.sin(zoneLatitude * (Math.PI / 180)) *
      Math.cos((pointLongitude - zoneLongitude) * (Math.PI / 180));

    return (Math.atan2(y, x) * 180) / Math.PI;
  }

  private getAngleDifference(angleA: number, angleB: number): number {
    return Math.abs((((angleA - angleB + 540) % 360) - 180));
  }

  private isConsistentExitPath(
    points: MovementLocation[],
    zone: { latitude: number; longitude: number; radius: number },
  ): boolean {
    const chronologicalPoints = [...points].sort(
      (a, b) => a.recordedAt.getTime() - b.recordedAt.getTime(),
    );
    const bearings = chronologicalPoints.map((point) =>
      this.getBearingFromZoneCenter(
        zone.latitude,
        zone.longitude,
        point.latitude,
        point.longitude,
      ),
    );
    const distances = chronologicalPoints.map((point) =>
      this.getDistanceInMeters(
        point.latitude,
        point.longitude,
        zone.latitude,
        zone.longitude,
      ),
    );
    const maxBearingDiff = Math.max(
      this.getAngleDifference(bearings[0], bearings[1]),
      this.getAngleDifference(bearings[1], bearings[2]),
      this.getAngleDifference(bearings[0], bearings[2]),
    );
    const lastDistance = distances[distances.length - 1];
    const firstDistance = distances[0];
    const distanceProgress = lastDistance - firstDistance;
    const staysAwayFromCenter =
      distances[1] >= firstDistance - zone.radius * 0.15 &&
      distances[2] >= distances[1] - zone.radius * 0.15;
    const movesAwayFromCenter = distanceProgress >= zone.radius * 0.2;
    const hasPlausibleSpeed = chronologicalPoints.every((point, index) => {
      if (index === 0) return true;

      const previous = chronologicalPoints[index - 1];
      const timeDiffSeconds =
        (point.recordedAt.getTime() - previous.recordedAt.getTime()) / 1000;
      if (timeDiffSeconds <= 0) return false;

      const distance = this.getDistanceInMeters(
        previous.latitude,
        previous.longitude,
        point.latitude,
        point.longitude,
      );
      const speedKmh = (distance / timeDiffSeconds) * 3.6;
      return speedKmh <= 180;
    });

    return (
      maxBearingDiff <= 70 &&
      hasPlausibleSpeed &&
      (movesAwayFromCenter || staysAwayFromCenter)
    );
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
    dto: RecordLocationDto,
    prevLocation: MovementLocation | null,
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

    if (calculatedSpeedKmh > 180) return 'invalid';

    const gpsSpeedKmh = dto.speed ?? 0;
    if (gpsSpeedKmh >= 3 && accuracy <= 80) {
      return 'moving';
    }

    if (distanceFromPrevious < 15) {
      return 'stationary';
    }

    if (
      accuracy <= 18 &&
      distanceFromPrevious >= 150 &&
      calculatedSpeedKmh >= 1
    ) {
      return 'moving';
    }

    return calculatedSpeedKmh >= 3 && accuracy <= 50 ? 'moving' : 'stationary';
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
    const recordedAt = dto.recordedAt ? new Date(dto.recordedAt) : new Date();
    const isStale = dto.recordedAt
      ? Date.now() - recordedAt.getTime() > 5 * 60 * 1000
      : false;

    // Use the previous point in event time, not the newest row by server arrival.
    // This keeps delayed/offline locations from looking like impossible jumps.
    const prevLocation = await this.prisma.location.findFirst({
      where: {
        userId,
        recordedAt: { lt: recordedAt },
      },
      orderBy: { recordedAt: 'desc' },
    });

    const movementStatus = await this.calculateMovementStatus(
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

      // Giriş Senaryosu: Önceki konum bölge dışında, yeni konum içinde
      if (insideZoneId && prevZoneId !== insideZoneId) {
        const zone = safeZones.find((z) => z.id === insideZoneId);
        if (zone) {
          // Drift Guard: Tek noktalık dışarı sapmasından sonra gelen içeri dönüşü
          // gerçek giriş gibi bildirmemek için önceki konumların da dışarıda olduğunu doğrula.
          let confirmEnter = true;
          if (!isStale && prevLocation) {
            const recentPreviousLocations = await this.prisma.location.findMany({
              where: {
                userId,
                recordedAt: { lt: recordedAt },
              },
              orderBy: { recordedAt: 'desc' },
              take: 3,
            });

            if (recentPreviousLocations.length >= 3) {
              const toleratedRadius = this.getGeofenceToleranceRadius(zone.radius);
              const outsidePoints = recentPreviousLocations.filter((loc) => {
                const dist = this.getDistanceInMeters(
                  loc.latitude,
                  loc.longitude,
                  zone.latitude,
                  zone.longitude,
                );
                return dist > toleratedRadius;
              });

              if (outsidePoints.length < 2) {
                confirmEnter = false;
                this.logger.log(
                  `Geofence girişi doğrulanmadı (Drift Guard). Son 3 önceki konumdan sadece ${outsidePoints.length} tanesi bölge dışındaydı.`,
                );
              }
            } else {
              confirmEnter = false;
            }
          }

          if (confirmEnter) {
            const alertTitle = 'Güvenli Bölgeye Giriş';
            const alertMsg = this.formatGeofenceEventMessage(
              user.name,
              zone.name,
              'giriş yaptı',
              recordedAt,
              isStale,
            );

            await this.notificationsService.resolveActiveAlerts(
              userId,
              AlertType.safe_zone_exit,
            );

            await this.notificationsService.raiseFamilyAlert({
              familyId,
              userId,
              type: AlertType.safe_zone_enter,
              title: alertTitle,
              message: alertMsg,
              metadata: {
                safeZoneId: zone.id,
                safeZoneName: zone.name,
                occurredAt: recordedAt.toISOString(),
                delayedDelivery: isStale,
              },
              notificationData: {
                type: 'safe_zone_enter',
                userId,
                zoneId: zone.id,
              },
              delivery: 'family',
              dedupeWindowMs: 2 * 60 * 1000,
            });
          }
        }
      }

      // Çıkış Senaryosu: Kullanıcı bölge dışına çıkmış görünüyor.
      const exitCandidateZones = safeZones.filter((zone) => {
        if (insideZoneId === zone.id) {
          return false;
        }

        return prevZoneId === zone.id || !insideZoneId;
      });

      for (const zone of exitCandidateZones) {
        // Drift Guard: Çıkışı, güvenli alan yarıçapının %20 tolerans dışındaki
        // art arda gelen konumlarla doğrula. Tek noktalık sağ/sol sapmaları çıkış sayma.
        let confirmExit = true;
        if (!isStale) {
          const recentLocations = await this.prisma.location.findMany({
            where: {
              userId,
              recordedAt: { lte: recordedAt },
            },
            orderBy: { recordedAt: 'desc' },
            take: 4,
          });

          if (recentLocations.length >= 3) {
            const toleratedRadius = this.getGeofenceToleranceRadius(zone.radius);
            const latestThree = recentLocations.slice(0, 3);
            const outsidePoints = latestThree.filter((loc) => {
              const dist = this.getDistanceInMeters(
                loc.latitude,
                loc.longitude,
                zone.latitude,
                zone.longitude,
              );
              return dist > toleratedRadius;
            });
            const previousInsidePoint = recentLocations.slice(3).find((loc) => {
              const dist = this.getDistanceInMeters(
                loc.latitude,
                loc.longitude,
                zone.latitude,
                zone.longitude,
              );
              return dist <= zone.radius;
            });

            if (
              outsidePoints.length < 3 ||
              !previousInsidePoint ||
              !this.isConsistentExitPath(latestThree, zone)
            ) {
              confirmExit = false;
              this.logger.log(
                `Geofence çıkışı doğrulanmadı (Drift Guard). Son 3 konumdan ${outsidePoints.length} tanesi ${Math.round(toleratedRadius)}m toleransın dışındaydı veya hareket yönü tutarlı değildi.`,
              );
            }
          } else {
            confirmExit = false;
          }
        }

        if (confirmExit) {
          const alertTitle = 'Güvenli Bölgeden Çıkış';
          const alertMsg = this.formatGeofenceEventMessage(
            user.name,
            zone.name,
            'çıkış yaptı',
            recordedAt,
            isStale,
          );

          await this.notificationsService.raiseFamilyAlert({
            familyId,
            userId,
            type: AlertType.safe_zone_exit,
            title: alertTitle,
            message: alertMsg,
            metadata: {
              safeZoneId: zone.id,
              safeZoneName: zone.name,
              occurredAt: recordedAt.toISOString(),
              delayedDelivery: isStale,
            },
            notificationData: {
              type: 'safe_zone_exit',
              userId,
              zoneId: zone.id,
            },
            delivery: 'family',
            dedupeActive: true,
            dedupeWindowMs: 2 * 60 * 1000,
          });
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
      const firstRecordedAt = historicalLocationDtos[0].recordedAt
        ? new Date(historicalLocationDtos[0].recordedAt)
        : new Date();
      let prevLocation: MovementLocation | null = await this.prisma.location.findFirst({
        where: {
          userId,
          recordedAt: { lt: firstRecordedAt },
        },
        orderBy: { recordedAt: 'desc' },
      });

      const dataToInsert: Prisma.LocationCreateManyInput[] = [];
      for (const loc of historicalLocationDtos) {
        const recordedAt = loc.recordedAt ? new Date(loc.recordedAt) : new Date();
        const movementStatus = await this.calculateMovementStatus(
          loc,
          prevLocation,
        );
        const data = {
          userId,
          latitude: loc.latitude,
          longitude: loc.longitude,
          accuracy: loc.accuracy,
          speed: loc.speed,
          batteryLevel: loc.batteryLevel,
          isCharging: loc.isCharging ?? false,
          connectionStatus: loc.connectionStatus || 'offline',
          movementStatus,
          recordedAt,
        };

        dataToInsert.push(data);
        prevLocation = {
          latitude: data.latitude,
          longitude: data.longitude,
          speed: data.speed ?? null,
          accuracy: data.accuracy ?? null,
          recordedAt: data.recordedAt,
          movementStatus: data.movementStatus,
        };
      }

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
