import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Alert, AlertType, MemberType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RecordLocationDto } from './dto/record-location.dto';
import { advanceGeofence, emptyGeofenceMemory } from './geofence-engine';
import { isLocationStale } from './location-freshness';

function eventMessage(
  name: string,
  zone: string,
  enter: boolean,
  at: Date,
  delayed: boolean,
  offline: boolean,
): string {
  const action = enter
    ? 'güvenli bölgesine giriş yaptı'
    : 'güvenli bölgesinden çıkış yaptı';
  if (!delayed) return `${name}, "${zone}" ${action}.`;
  const time = new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Europe/Istanbul',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(at);
  const deliveryNote = offline
    ? 'Çevrimdışı kaydedildi; internet bağlantısı geldikten sonra iletildi.'
    : 'Konum kaydı sunucuya gecikmeli ulaştığı için bildirim sonradan iletildi.';
  return `${name}, ${time} tarihinde "${zone}" ${action}. ${deliveryNote}`;
}

/** The location, evidence counters and event are committed together, before network I/O. */
export async function saveLocationWithGeofences(
  prisma: PrismaService,
  userId: string,
  dto: RecordLocationDto,
) {
  const receivedAt = new Date();
  const recordedAt = new Date(dto.measuredAt || dto.recordedAt || receivedAt);
  if (
    !Number.isFinite(recordedAt.getTime()) ||
    recordedAt.getTime() > Date.now() + 30_000
  ) {
    throw new BadRequestException('Konum ölçüm zamanı geçersiz.');
  }
  const isStale = isLocationStale(recordedAt, receivedAt);
  return prisma.$transaction(
    async (tx) => {
      // Cross-process serialization, also covering the first state-row creation.
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${userId}, 0))`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });
      if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
      const memberships = await tx.familyMember.findMany({
        where: {
          userId,
          ...(process.env.EARLY_ACCESS_ENABLED === 'true'
            ? {}
            : {
                family: {
                  owner: {
                    OR: [
                      { trialEndsAt: { gt: new Date() } },
                      {
                        isPremium: true,
                        premiumExpiresAt: { gt: new Date() },
                      },
                    ],
                  },
                },
              }),
        },
        select: {
          familyId: true,
          memberType: true,
          guardianTrackingEnabled: true,
        },
      });
      const trackableMemberships = memberships.filter(
        (member) =>
          member.memberType === MemberType.child ||
          member.memberType === MemberType.elder ||
          member.guardianTrackingEnabled,
      );
      const include = {
        user: { select: { id: true, name: true, email: true } },
      };
      const existing = dto.devicePointId
        ? await tx.location.findUnique({
            where: {
              userId_devicePointId: {
                userId,
                devicePointId: dto.devicePointId,
              },
            },
            include,
          })
        : null;
      const alerts: Alert[] = [];
      const broadcasts: Array<{
        familyId: string;
        insideZoneName: string | null;
      }> = [];
      if (existing)
        return {
          newLocation: existing,
          duplicate: true,
          alerts,
          broadcasts,
          user,
          trackableMemberships,
          isStale,
        };

      const newLocation = await tx.location.create({
        data: {
          userId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          accuracy: dto.accuracy,
          speed: dto.speed,
          batteryLevel: dto.batteryLevel,
          isCharging: dto.isCharging ?? false,
          connectionStatus: dto.connectionStatus || 'online',
          movementStatus: dto.movementStatus || 'unknown',
          recordedAt,
          receivedAt,
          devicePointId: dto.devicePointId,
          filterVersion: dto.filterVersion || 'legacy-client',
          deliveryMode:
            dto.deliveryMode ||
            (dto.connectionStatus === 'offline' ? 'deferred' : 'live'),
          deferredReason: dto.deferredReason,
        },
        include,
      });
      for (const membership of trackableMemberships) {
        const { familyId } = membership;
        const zones = await tx.safeZone.findMany({
          where: { familyId },
          orderBy: { id: 'asc' },
        });
        let insideZoneName: string | null = null;
        for (const zone of zones) {
          if (recordedAt < zone.createdAt) continue;
          const where = { userId_safeZoneId: { userId, safeZoneId: zone.id } };
          const previous = await tx.geofenceState.findUnique({ where });
          let memory = previous ?? emptyGeofenceMemory();
          if (!previous) {
            // Warm up newly deployed state from recent measurements, without replaying old alerts.
            const history = await tx.location.findMany({
              where: {
                userId,
                recordedAt: {
                  lt: recordedAt,
                  gte: new Date(
                    Math.max(
                      zone.createdAt.getTime(),
                      recordedAt.getTime() - 24 * 60 * 60_000,
                    ),
                  ),
                },
              },
              orderBy: { recordedAt: 'desc' },
              take: 200,
            });
            for (const point of history.reverse())
              memory = advanceGeofence(memory, point, zone).memory;
          }
          const result = advanceGeofence(memory, newLocation, zone);
          if (!result.ignored) {
            await tx.geofenceState.upsert({
              where,
              create: { userId, safeZoneId: zone.id, ...result.memory },
              update: result.memory,
            });
          }
          if (result.memory.status === 'inside' && insideZoneName === null)
            insideZoneName = zone.name;
          if (!result.event) continue;
          const enter = result.event === 'enter';
          const type = enter
            ? AlertType.safe_zone_enter
            : AlertType.safe_zone_exit;
          const occurredAt = memory.candidateSince ?? recordedAt;
          if (isStale || isLocationStale(occurredAt, receivedAt)) {
            // Activity reads these rows as historical events. Do not resolve a
            // live alert, consume today's notification budget, or enqueue delivery.
            await tx.alert.create({
              data: {
                userId,
                familyId,
                type,
                status: 'resolved',
                createdAt: occurredAt,
                resolvedAt: receivedAt,
                title: enter
                  ? 'Güvenli Bölgeye Giriş'
                  : 'Güvenli Bölgeden Çıkış',
                message: `${user.name}, "${zone.name}" ${enter ? 'güvenli bölgesine giriş yaptı' : 'güvenli bölgesinden çıkış yaptı'}. Geçmiş konum kaydından hesaplandı.`,
                metadata: {
                  safeZoneId: zone.id,
                  safeZoneName: zone.name,
                  occurredAt: occurredAt.toISOString(),
                  confirmedAt: recordedAt.toISOString(),
                  delayedDelivery: true,
                  historical: true,
                },
              },
            });
            continue;
          }
          // Alert rows are the durable budget ledger, including resolved alerts.
          // Check and insert share the user advisory lock and transaction above.
          // Capture server time after acquiring the lock; measurement time must
          // never replenish a budget (including delayed/offline bulk uploads).
          const notificationAt = new Date(Date.now());
          const recentAlerts = await tx.alert.findMany({
            where: {
              userId,
              familyId,
              type: {
                in: [AlertType.safe_zone_enter, AlertType.safe_zone_exit],
              },
              metadata: { path: ['safeZoneId'], equals: zone.id },
              OR: [
                { metadata: { path: ['historical'], equals: Prisma.AnyNull } },
                { metadata: { path: ['historical'], equals: false } },
              ],
              createdAt: {
                gt: new Date(notificationAt.getTime() - 60 * 60_000),
              },
            },
            select: { type: true, createdAt: true },
            orderBy: { createdAt: 'desc' },
            take: 12,
          });
          if (
            recentAlerts.length >= 12 ||
            recentAlerts.filter(
              (alert) =>
                alert.createdAt.getTime() >
                notificationAt.getTime() - 5 * 60_000,
            ).length >= 4 ||
            recentAlerts.some(
              (alert) =>
                alert.type === type &&
                alert.createdAt.getTime() > notificationAt.getTime() - 120_000,
            )
          ) {
            // Confirmed state and location still commit; no alert means no push
            // or alert websocket event. Suppression does not consume the budget.
            continue;
          }
          // Announce the first fix of the confirmed run, not the upload/confirmation time.
          const evidence = await tx.location.findMany({
            where: { userId, recordedAt: { gte: occurredAt, lte: recordedAt } },
          });
          const recordedOffline = evidence.some(
            (point) => point.connectionStatus === 'offline',
          );
          const delayedDelivery =
            recordedOffline ||
            evidence.some(
              (point) =>
                point.deliveryMode === 'deferred' || !!point.deferredReason,
            ) ||
            isLocationStale(occurredAt, receivedAt);
          // Resolve the previous transition for this zone only. Another zone must not suppress this one.
          await tx.alert.updateMany({
            where: {
              userId,
              familyId,
              type: {
                in: [AlertType.safe_zone_enter, AlertType.safe_zone_exit],
              },
              status: 'active',
              metadata: { path: ['safeZoneId'], equals: zone.id },
            },
            data: { status: 'resolved', resolvedAt: new Date() },
          });
          alerts.push(
            await tx.alert.create({
              data: {
                userId,
                familyId,
                type,
                createdAt: notificationAt,
                title: enter
                  ? 'Güvenli Bölgeye Giriş'
                  : 'Güvenli Bölgeden Çıkış',
                message: eventMessage(
                  user.name,
                  zone.name,
                  enter,
                  occurredAt,
                  delayedDelivery,
                  recordedOffline,
                ),
                metadata: {
                  safeZoneId: zone.id,
                  safeZoneName: zone.name,
                  occurredAt: occurredAt.toISOString(),
                  confirmedAt: recordedAt.toISOString(),
                  delayedDelivery,
                  recordedOffline,
                },
              },
            }),
          );
        }
        // Do not replay an old location over a more recent live position.
        const newer = await tx.location.findFirst({
          where: { userId, recordedAt: { gt: recordedAt } },
          select: { id: true },
        });
        if (!isStale && !newer) broadcasts.push({ familyId, insideZoneName });
      }
      return {
        newLocation,
        duplicate: false,
        alerts,
        broadcasts,
        user,
        trackableMemberships,
        isStale,
      };
    },
    { maxWait: 5000, timeout: 15000 },
  );
}

/** Read the same confirmed state used for notifications; raw jitter must not change the label. */
export async function confirmedZoneName(
  prisma: PrismaService,
  userId: string,
  familyId: string,
): Promise<string | null> {
  const state = await prisma.geofenceState.findFirst({
    where: { userId, status: 'inside', safeZone: { familyId } },
    orderBy: { safeZoneId: 'asc' },
    include: { safeZone: { select: { name: true } } },
  });
  return state?.safeZone.name ?? null;
}
