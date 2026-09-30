import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  Logger,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RecordLocationDto } from './dto/record-location.dto';
import {
  MAX_BULK_LOCATION_POINTS,
  RecordBulkLocationsDto,
} from './dto/record-bulk-locations.dto';
import { LocationsGateway } from './locations.gateway';
import {
  AlertType,
  AudibleWarningStatus,
  Location,
  MemberType,
  Prisma,
} from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { confirmedZoneName, saveLocationWithGeofences } from './geofence-store';
import { AckAudibleWarningDto } from './dto/ack-audible-warning.dto';
import { SubscriptionEntitlementService } from '../common/subscription-entitlement.service';

@Injectable()
export class LocationsService {
  private readonly logger = new Logger('LocationsService');

  constructor(
    private prisma: PrismaService,
    private locationsGateway: LocationsGateway,
    private notificationsService: NotificationsService,
    private subscriptionEntitlement: SubscriptionEntitlementService,
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
  async recordLocation(
    userId: string,
    dto: RecordLocationDto,
    broadcastLocation = true,
  ) {
    const result = await saveLocationWithGeofences(this.prisma, userId, dto);
    const { newLocation, user, trackableMemberships, isStale } = result;
    if (result.duplicate) return newLocation;

    for (const alert of result.alerts) {
      const metadata = alert.metadata as {
        safeZoneId: string;
        occurredAt: string;
        confirmedAt: string;
        delayedDelivery: boolean;
        recordedOffline: boolean;
      };
      try {
        await this.notificationsService.sendFamilyNotification(
          alert.familyId,
          userId,
          alert.title,
          alert.message,
          {
            type: alert.type,
            userId,
            zoneId: metadata.safeZoneId,
            alertId: alert.id,
            occurredAt: metadata.occurredAt,
            confirmedAt: metadata.confirmedAt,
            delayedDelivery: metadata.delayedDelivery,
            recordedOffline: metadata.recordedOffline,
          },
        );
      } catch (error) {
        // The committed alert remains visible in the notification history.
        this.logger.error(
          `Geofence notification delivery failed: ${alert.id}`,
          error,
        );
      }
    }
    for (const broadcast of broadcastLocation ? result.broadcasts : []) {
      await this.locationsGateway.sendLocationUpdate(broadcast.familyId, {
        ...newLocation,
        insideZoneName: broadcast.insideZoneName,
      });
    }
    // Historical measurements must not mutate today's connection/battery state.
    if (isStale) return newLocation;

    await this.notificationsService.resolveActiveAlerts(
      userId,
      AlertType.connection_lost,
    );

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
          delivery: 'family',
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
    if (locations && locations.length > MAX_BULK_LOCATION_POINTS) {
      throw new BadRequestException(
        `Tek bir toplu konum isteği en fazla ${MAX_BULK_LOCATION_POINTS} nokta içerebilir.`,
      );
    }
    if (!locations || locations.length === 0) {
      return {
        success: true,
        count: 0,
        acceptedIds: [],
        duplicateIds: [],
        rejectedItems: [],
      };
    }

    // 1. Konumları tarihlerine göre eskiden yeniye doğru sıralayalım
    const sortedLocations = [...locations].sort((a, b) => {
      const timeA = new Date(a.measuredAt || a.recordedAt || 0).getTime();
      const timeB = new Date(b.measuredAt || b.recordedAt || 0).getTime();
      return timeA - timeB;
    });

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    const acceptedIds: string[] = [];
    const duplicateIds: string[] = [];
    const rejectedItems: Array<{ devicePointId: string; reason: string }> = [];
    let savedLatestLocation: Location | null = null;

    const validLocations = sortedLocations.filter((loc) => {
      if (!loc.devicePointId) {
        rejectedItems.push({
          devicePointId: '',
          reason: 'missing_device_point_id',
        });
        return false;
      }

      const recordedAt = new Date(loc.measuredAt || loc.recordedAt || '');
      if (
        !Number.isFinite(recordedAt.getTime()) ||
        recordedAt.getTime() > Date.now() + 30_000
      ) {
        rejectedItems.push({
          devicePointId: loc.devicePointId,
          reason: 'invalid_measurement_time',
        });
        return false;
      }
      return true;
    });

    // Every point goes through the same transaction/state machine, in measurement order.
    for (const loc of validLocations) {
      const where = {
        userId_devicePointId: { userId, devicePointId: loc.devicePointId! },
      };
      const existing = await this.prisma.location.findUnique({ where });
      if (existing) {
        duplicateIds.push(loc.devicePointId!);
        savedLatestLocation = existing;
        continue;
      }
      try {
        // Only the final valid measurement may broadcast; the store also checks
        // freshness and whether a newer location already exists in the database.
        savedLatestLocation = await this.recordLocation(
          userId,
          loc,
          loc === validLocations[validLocations.length - 1],
        );
        acceptedIds.push(loc.devicePointId!);
      } catch (error) {
        // Location and geofence event are atomic; a stored row means both committed.
        const saved = await this.prisma.location.findUnique({ where });
        if (saved) {
          acceptedIds.push(loc.devicePointId!);
          savedLatestLocation = saved;
        } else {
          this.logger.error(
            `Bulk location failed: ${loc.devicePointId}`,
            error,
          );
          rejectedItems.push({
            devicePointId: loc.devicePointId!,
            reason: 'storage_error',
          });
          // Do not advance past a failed point: that would discard it as out-of-order on retry.
          break;
        }
      }
    }

    return {
      success: true,
      count: acceptedIds.length + duplicateIds.length,
      acceptedIds,
      duplicateIds,
      rejectedItems,
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
    await this.subscriptionEntitlement.assertFamilyEntitled(familyId);

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

      const insideZoneName = await confirmedZoneName(
        this.prisma,
        userId,
        familyId,
      );

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
      select: {
        userId: true,
        memberType: true,
        guardianTrackingEnabled: true,
        createdAt: true,
      },
    });

    const sharedGuardianIds = members
      .filter(
        (member) =>
          member.userId !== userId &&
          member.memberType === MemberType.guardian &&
          member.guardianTrackingEnabled,
      )
      .map((member) => member.userId);
    const openTrackingIntervals =
      sharedGuardianIds.length === 0
        ? []
        : await this.prisma.guardianTrackingInterval.findMany({
            where: {
              familyId,
              guardianUserId: { in: sharedGuardianIds },
              endedAt: null,
            },
            select: { guardianUserId: true, startedAt: true },
            orderBy: { startedAt: 'desc' },
          });
    const currentTrackingStartByGuardian = new Map<string, Date>();
    for (const interval of openTrackingIntervals) {
      if (!currentTrackingStartByGuardian.has(interval.guardianUserId)) {
        currentTrackingStartByGuardian.set(
          interval.guardianUserId,
          interval.startedAt,
        );
      }
    }

    // Her üyenin en son konumunu getir ve hangi güvenli bölgede olduğunu hesapla
    const latestLocations = await Promise.all(
      members.map(async (member) => {
        const uid = member.userId;
        let authorizedFrom: Date | undefined;
        if (uid !== userId) {
          authorizedFrom = new Date(
            Math.max(isMember.createdAt.getTime(), member.createdAt.getTime()),
          );
          if (member.memberType === MemberType.guardian) {
            const trackingStartedAt = currentTrackingStartByGuardian.get(uid);
            if (!trackingStartedAt) return null;
            authorizedFrom = new Date(
              Math.max(authorizedFrom.getTime(), trackingStartedAt.getTime()),
            );
          }
        }

        const loc = await this.prisma.location.findFirst({
          where: {
            userId: uid,
            ...(authorizedFrom ? { recordedAt: { gte: authorizedFrom } } : {}),
          },
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

        const insideZoneName = await confirmedZoneName(
          this.prisma,
          uid,
          familyId,
        );

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
    await this.subscriptionEntitlement.assertFamilyEntitled(familyId);

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
      isMember.memberType !== MemberType.guardian
    ) {
      throw new ForbiddenException(
        'Bu uyenin takip verilerine erisim yetkiniz yok.',
      );
    }

    // Tarih araligini Turkiye gunune gore UTC olarak belirle.
    const { startOfDay, endOfDay } = this.getIstanbulDayRangeUtc(dateStr);

    if (userId === targetUserId) {
      return this.prisma.location.findMany({
        where: {
          userId: targetUserId,
          recordedAt: { gte: startOfDay, lte: endOfDay },
        },
        orderBy: { recordedAt: 'asc' },
        select: {
          id: true,
          latitude: true,
          longitude: true,
          recordedAt: true,
          batteryLevel: true,
          speed: true,
          accuracy: true,
          connectionStatus: true,
          movementStatus: true,
          receivedAt: true,
          devicePointId: true,
          filterVersion: true,
          deliveryMode: true,
          deferredReason: true,
        },
      });
    }

    const membershipLowerBound = new Date(
      Math.max(isMember.createdAt.getTime(), targetMember.createdAt.getTime()),
    );
    const authorizedStart = new Date(
      Math.max(startOfDay.getTime(), membershipLowerBound.getTime()),
    );
    if (authorizedStart.getTime() > endOfDay.getTime()) return [];

    let authorizedWindows: Prisma.LocationWhereInput[] | undefined;
    if (targetMember.memberType === MemberType.guardian) {
      const intervals = await this.prisma.guardianTrackingInterval.findMany({
        where: {
          familyId,
          guardianUserId: targetUserId,
          startedAt: { lte: endOfDay },
          OR: [{ endedAt: null }, { endedAt: { gt: authorizedStart } }],
        },
        select: { startedAt: true, endedAt: true },
        orderBy: { startedAt: 'asc' },
      });

      authorizedWindows = intervals
        .map((interval): Prisma.LocationWhereInput | null => {
          const intervalStart = new Date(
            Math.max(authorizedStart.getTime(), interval.startedAt.getTime()),
          );
          if (
            interval.endedAt &&
            interval.endedAt.getTime() <= intervalStart.getTime()
          ) {
            return null;
          }
          if (
            interval.endedAt &&
            interval.endedAt.getTime() <= endOfDay.getTime()
          ) {
            return {
              recordedAt: { gte: intervalStart, lt: interval.endedAt },
            };
          }
          return { recordedAt: { gte: intervalStart, lte: endOfDay } };
        })
        .filter(
          (window): window is Prisma.LocationWhereInput => window !== null,
        );

      if (authorizedWindows.length === 0) return [];
    }

    return this.prisma.location.findMany({
      where: {
        userId: targetUserId,
        ...(authorizedWindows
          ? { OR: authorizedWindows }
          : { recordedAt: { gte: authorizedStart, lte: endOfDay } }),
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
        accuracy: true,
        connectionStatus: true,
        movementStatus: true,
        receivedAt: true,
        devicePointId: true,
        filterVersion: true,
        deliveryMode: true,
        deferredReason: true,
      },
    });
  }

  async sendAudibleWarning(
    senderId: string,
    targetUserId: string,
    eventId: string,
  ) {
    if (senderId === targetUserId) {
      throw new ForbiddenException('Kendinize sesli uyari gonderemezsiniz.');
    }

    let result: {
      warning: { id: string };
      senderName: string;
      idempotent: boolean;
    };
    try {
      result = await this.prisma.$transaction(async (tx) => {
        // One target lock serializes sender cooldown, target burst and retries
        // across every backend instance.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`audible-warning:${targetUserId}`}, 0))`;

        const target = await tx.familyMember.findFirst({
          where: {
            userId: targetUserId,
            memberType: { in: [MemberType.child, MemberType.elder] },
            family: {
              members: {
                some: { userId: senderId, memberType: MemberType.guardian },
              },
            },
          },
          select: { familyId: true },
        });
        if (!target) {
          throw new ForbiddenException(
            'Bu uyeye sesli uyari gonderme yetkiniz yok.',
          );
        }
        await this.subscriptionEntitlement.assertFamilyEntitled(
          target.familyId,
        );

        const sender = await tx.user.findUnique({
          where: { id: senderId },
          select: { name: true },
        });
        const senderName = sender?.name || 'Veliniz';
        const existing = await tx.audibleWarning.findUnique({
          where: {
            senderId_targetUserId_eventId: {
              senderId,
              targetUserId,
              eventId,
            },
          },
          select: { id: true },
        });
        if (existing) {
          return { warning: existing, senderName, idempotent: true };
        }

        const cooldownStart = new Date(Date.now() - 60_000);
        const [senderRecent, targetRecentCount] = await Promise.all([
          tx.audibleWarning.findFirst({
            where: { senderId, targetUserId, createdAt: { gt: cooldownStart } },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          }),
          tx.audibleWarning.count({
            where: { targetUserId, createdAt: { gt: cooldownStart } },
          }),
        ]);
        if (senderRecent || targetRecentCount >= 3) {
          const retryAfterSeconds = senderRecent
            ? Math.max(
                1,
                Math.ceil(
                  (senderRecent.createdAt.getTime() + 60_000 - Date.now()) /
                    1000,
                ),
              )
            : 60;
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              error: 'Too Many Requests',
              code: 'AUDIBLE_WARNING_COOLDOWN_ACTIVE',
              message:
                'Bu kişiye kısa süre önce sesli uyarı gönderildi. Bir süre sonra tekrar deneyin.',
              retryAfterSeconds,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        const warning = await tx.audibleWarning.create({
          data: {
            eventId,
            familyId: target.familyId,
            senderId,
            targetUserId,
          },
          select: { id: true },
        });
        return { warning, senderName, idempotent: false };
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const warning = await this.prisma.audibleWarning.findUnique({
        where: {
          senderId_targetUserId_eventId: { senderId, targetUserId, eventId },
        },
        select: { id: true },
      });
      if (!warning) throw error;
      const sender = await this.prisma.user.findUnique({
        where: { id: senderId },
        select: { name: true },
      });
      result = {
        warning,
        senderName: sender?.name || 'Veliniz',
        idempotent: true,
      };
    }

    if (!result.idempotent) {
      try {
        await this.notificationsService.sendOneSignalNotification(
          [targetUserId],
          'ACIL SESLI UYARI!',
          `${result.senderName} size sesli uyari gonderdi!`,
          {
            action: 'play_warning_sound',
            senderName: result.senderName,
            warningId: result.warning.id,
          },
        );
      } catch (error) {
        this.logger.error(
          `Sesli uyari push teslimi basarisiz: warningId=${result.warning.id}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
    return {
      success: true,
      warningId: result.warning.id,
      idempotent: result.idempotent,
    };
  }

  async ackAudibleWarning(
    authenticatedUserId: string,
    dto: AckAudibleWarningDto,
  ) {
    if (!['received', 'muted', 'unanswered'].includes(dto.action)) {
      throw new BadRequestException('Gecersiz sesli uyari action degeri.');
    }
    const result = await this.prisma.$transaction(async (tx) => {
      const warning = await tx.audibleWarning.findUnique({
        where: { id: dto.warningId },
        select: {
          id: true,
          familyId: true,
          senderId: true,
          targetUserId: true,
          status: true,
          target: { select: { name: true } },
        },
      });
      if (!warning) throw new NotFoundException('Sesli uyari bulunamadi.');
      await this.subscriptionEntitlement.assertFamilyEntitled(warning.familyId);
      if (warning.targetUserId !== authenticatedUserId) {
        throw new ForbiddenException('Bu sesli uyarinin hedefi degilsiniz.');
      }
      const [senderMember, targetMember] = await Promise.all([
        tx.familyMember.findUnique({
          where: {
            familyId_userId: {
              familyId: warning.familyId,
              userId: warning.senderId,
            },
          },
          select: { memberType: true },
        }),
        tx.familyMember.findUnique({
          where: {
            familyId_userId: {
              familyId: warning.familyId,
              userId: warning.targetUserId,
            },
          },
          select: { memberType: true },
        }),
      ]);
      if (
        senderMember?.memberType !== MemberType.guardian ||
        !targetMember ||
        (targetMember.memberType !== MemberType.child &&
          targetMember.memberType !== MemberType.elder)
      ) {
        throw new ForbiddenException('Sesli uyari iliskisi gecersiz.');
      }
      // received is delivery confirmation; muted/unanswered are terminal.
      const allowedStatuses: AudibleWarningStatus[] =
        dto.action === 'received'
          ? [AudibleWarningStatus.pending]
          : [AudibleWarningStatus.pending, AudibleWarningStatus.received];
      if (!allowedStatuses.includes(warning.status)) {
        return { processed: false, warning };
      }
      const update = await tx.audibleWarning.updateMany({
        where: { id: warning.id, status: { in: allowedStatuses } },
        data: { status: dto.action, acknowledgedAt: new Date() },
      });
      if (update.count !== 1) return { processed: false, warning };
      if (dto.action === AudibleWarningStatus.unanswered) {
        await tx.alert.create({
          data: {
            familyId: warning.familyId,
            userId: warning.targetUserId,
            type: AlertType.sos,
            title: 'Sesli Uyarı Yanıtsız Kaldı',
            message: `${warning.target.name} sesli uyarıya yanit vermedi.`,
            metadata: { senderId: warning.senderId },
            audibleWarningId: warning.id,
          },
        });
      }
      return { processed: true, warning };
    });
    if (!result.processed) return { success: true, duplicate: true };
    this.locationsGateway.sendEventToUser(
      result.warning.senderId,
      'audible_warning_status',
      {
        warningId: result.warning.id,
        childId: result.warning.targetUserId,
        childName: result.warning.target.name,
        status: dto.action,
        deliveredAt: new Date(),
      },
    );
    if (dto.action === AudibleWarningStatus.unanswered) {
      await this.notificationsService.sendFamilyNotification(
        result.warning.familyId,
        result.warning.targetUserId,
        'Sesli Uyarı Yanıtsız Kaldı',
        `${result.warning.target.name} sesli uyarıya yanit vermedi.`,
        {
          action: 'audible_warning_unanswered',
          childId: result.warning.targetUserId,
          warningId: result.warning.id,
        },
      );
    }
    return { success: true, duplicate: false };
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
