"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const record_bulk_locations_dto_1 = require("./dto/record-bulk-locations.dto");
const locations_gateway_1 = require("./locations.gateway");
const client_1 = require("@prisma/client");
const notifications_service_1 = require("../notifications/notifications.service");
const geofence_store_1 = require("./geofence-store");
const subscription_entitlement_service_1 = require("../common/subscription-entitlement.service");
let LocationsService = class LocationsService {
    prisma;
    locationsGateway;
    notificationsService;
    subscriptionEntitlement;
    logger = new common_1.Logger('LocationsService');
    constructor(prisma, locationsGateway, notificationsService, subscriptionEntitlement) {
        this.prisma = prisma;
        this.locationsGateway = locationsGateway;
        this.notificationsService = notificationsService;
        this.subscriptionEntitlement = subscriptionEntitlement;
    }
    getIstanbulDateKey(date = new Date()) {
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
    getIstanbulDayRangeUtc(dateStr) {
        const dateKey = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
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
    async recordLocation(userId, dto, broadcastLocation = true) {
        const result = await (0, geofence_store_1.saveLocationWithGeofences)(this.prisma, userId, dto);
        const { newLocation, user, trackableMemberships, isStale } = result;
        if (result.duplicate)
            return newLocation;
        for (const alert of result.alerts) {
            const metadata = alert.metadata;
            try {
                await this.notificationsService.sendFamilyNotification(alert.familyId, userId, alert.title, alert.message, {
                    type: alert.type,
                    userId,
                    zoneId: metadata.safeZoneId,
                    alertId: alert.id,
                    occurredAt: metadata.occurredAt,
                    confirmedAt: metadata.confirmedAt,
                    delayedDelivery: metadata.delayedDelivery,
                    recordedOffline: metadata.recordedOffline,
                });
            }
            catch (error) {
                this.logger.error(`Geofence notification delivery failed: ${alert.id}`, error);
            }
        }
        for (const broadcast of broadcastLocation ? result.broadcasts : []) {
            await this.locationsGateway.sendLocationUpdate(broadcast.familyId, {
                ...newLocation,
                insideZoneName: broadcast.insideZoneName,
            });
        }
        if (isStale)
            return newLocation;
        await this.notificationsService.resolveActiveAlerts(userId, client_1.AlertType.connection_lost);
        if (dto.batteryLevel !== undefined) {
            if (dto.batteryLevel <= 15 && !dto.isCharging) {
                const alertTitle = 'Dusuk Sarj Uyarisi';
                const alertMsg = `${user.name} adli aile uyesinin sarji %${dto.batteryLevel} seviyesine dustu!`;
                await this.notificationsService.raiseUserAlertForFamilies({
                    familyIds: trackableMemberships.map((membership) => membership.familyId),
                    userId,
                    type: client_1.AlertType.low_battery,
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
            }
            else if (dto.batteryLevel > 15 || dto.isCharging) {
                await this.notificationsService.resolveActiveAlerts(userId, client_1.AlertType.low_battery);
            }
        }
        return newLocation;
    }
    async recordBulkLocations(userId, dto) {
        const { locations } = dto;
        if (locations && locations.length > record_bulk_locations_dto_1.MAX_BULK_LOCATION_POINTS) {
            throw new common_1.BadRequestException(`Tek bir toplu konum isteği en fazla ${record_bulk_locations_dto_1.MAX_BULK_LOCATION_POINTS} nokta içerebilir.`);
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
            throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
        }
        const acceptedIds = [];
        const duplicateIds = [];
        const rejectedItems = [];
        let savedLatestLocation = null;
        const validLocations = sortedLocations.filter((loc) => {
            if (!loc.devicePointId) {
                rejectedItems.push({
                    devicePointId: '',
                    reason: 'missing_device_point_id',
                });
                return false;
            }
            const recordedAt = new Date(loc.measuredAt || loc.recordedAt || '');
            if (!Number.isFinite(recordedAt.getTime()) ||
                recordedAt.getTime() > Date.now() + 30_000) {
                rejectedItems.push({
                    devicePointId: loc.devicePointId,
                    reason: 'invalid_measurement_time',
                });
                return false;
            }
            return true;
        });
        for (const loc of validLocations) {
            const where = {
                userId_devicePointId: { userId, devicePointId: loc.devicePointId },
            };
            const existing = await this.prisma.location.findUnique({ where });
            if (existing) {
                duplicateIds.push(loc.devicePointId);
                savedLatestLocation = existing;
                continue;
            }
            try {
                savedLatestLocation = await this.recordLocation(userId, loc, loc === validLocations[validLocations.length - 1]);
                acceptedIds.push(loc.devicePointId);
            }
            catch (error) {
                const saved = await this.prisma.location.findUnique({ where });
                if (saved) {
                    acceptedIds.push(loc.devicePointId);
                    savedLatestLocation = saved;
                }
                else {
                    this.logger.error(`Bulk location failed: ${loc.devicePointId}`, error);
                    rejectedItems.push({
                        devicePointId: loc.devicePointId,
                        reason: 'storage_error',
                    });
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
    async getLatestLocations(userId, familyId) {
        const isMember = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId,
                    userId,
                },
            },
        });
        if (!isMember) {
            throw new common_1.ForbiddenException('Bu aile grubunun konum verilerine erişim yetkiniz yok.');
        }
        await this.subscriptionEntitlement.assertFamilyEntitled(familyId);
        if (isMember.memberType !== client_1.MemberType.guardian) {
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
            if (!myLocation)
                return [];
            const insideZoneName = await (0, geofence_store_1.confirmedZoneName)(this.prisma, userId, familyId);
            return [{ ...myLocation, insideZoneName }];
        }
        const members = await this.prisma.familyMember.findMany({
            where: {
                familyId,
                OR: [
                    { userId },
                    { memberType: { in: [client_1.MemberType.child, client_1.MemberType.elder] } },
                    {
                        memberType: client_1.MemberType.guardian,
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
            .filter((member) => member.userId !== userId &&
            member.memberType === client_1.MemberType.guardian &&
            member.guardianTrackingEnabled)
            .map((member) => member.userId);
        const openTrackingIntervals = sharedGuardianIds.length === 0
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
        const currentTrackingStartByGuardian = new Map();
        for (const interval of openTrackingIntervals) {
            if (!currentTrackingStartByGuardian.has(interval.guardianUserId)) {
                currentTrackingStartByGuardian.set(interval.guardianUserId, interval.startedAt);
            }
        }
        const latestLocations = await Promise.all(members.map(async (member) => {
            const uid = member.userId;
            let authorizedFrom;
            if (uid !== userId) {
                authorizedFrom = new Date(Math.max(isMember.createdAt.getTime(), member.createdAt.getTime()));
                if (member.memberType === client_1.MemberType.guardian) {
                    const trackingStartedAt = currentTrackingStartByGuardian.get(uid);
                    if (!trackingStartedAt)
                        return null;
                    authorizedFrom = new Date(Math.max(authorizedFrom.getTime(), trackingStartedAt.getTime()));
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
            if (!loc)
                return null;
            const insideZoneName = await (0, geofence_store_1.confirmedZoneName)(this.prisma, uid, familyId);
            return { ...loc, insideZoneName };
        }));
        return latestLocations.filter((loc) => loc !== null);
    }
    async getLocationsHistory(userId, familyId, targetUserId, dateStr) {
        const isMember = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId,
                    userId,
                },
            },
        });
        if (!isMember) {
            throw new common_1.ForbiddenException('Bu aile grubunun verilerine erişim yetkiniz yok.');
        }
        await this.subscriptionEntitlement.assertFamilyEntitled(familyId);
        const targetMember = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId,
                    userId: targetUserId,
                },
            },
        });
        if (!targetMember) {
            throw new common_1.NotFoundException('Hedef kullanıcı bu aile grubunda bulunamadı.');
        }
        if (userId !== targetUserId &&
            isMember.memberType !== client_1.MemberType.guardian) {
            throw new common_1.ForbiddenException('Bu uyenin takip verilerine erisim yetkiniz yok.');
        }
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
        const membershipLowerBound = new Date(Math.max(isMember.createdAt.getTime(), targetMember.createdAt.getTime()));
        const authorizedStart = new Date(Math.max(startOfDay.getTime(), membershipLowerBound.getTime()));
        if (authorizedStart.getTime() > endOfDay.getTime())
            return [];
        let authorizedWindows;
        if (targetMember.memberType === client_1.MemberType.guardian) {
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
                .map((interval) => {
                const intervalStart = new Date(Math.max(authorizedStart.getTime(), interval.startedAt.getTime()));
                if (interval.endedAt &&
                    interval.endedAt.getTime() <= intervalStart.getTime()) {
                    return null;
                }
                if (interval.endedAt &&
                    interval.endedAt.getTime() <= endOfDay.getTime()) {
                    return {
                        recordedAt: { gte: intervalStart, lt: interval.endedAt },
                    };
                }
                return { recordedAt: { gte: intervalStart, lte: endOfDay } };
            })
                .filter((window) => window !== null);
            if (authorizedWindows.length === 0)
                return [];
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
    async sendAudibleWarning(senderId, targetUserId, eventId) {
        if (senderId === targetUserId) {
            throw new common_1.ForbiddenException('Kendinize sesli uyari gonderemezsiniz.');
        }
        let result;
        try {
            result = await this.prisma.$transaction(async (tx) => {
                await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`audible-warning:${targetUserId}`}, 0))`;
                const target = await tx.familyMember.findFirst({
                    where: {
                        userId: targetUserId,
                        memberType: { in: [client_1.MemberType.child, client_1.MemberType.elder] },
                        family: {
                            members: {
                                some: { userId: senderId, memberType: client_1.MemberType.guardian },
                            },
                        },
                    },
                    select: { familyId: true },
                });
                if (!target) {
                    throw new common_1.ForbiddenException('Bu uyeye sesli uyari gonderme yetkiniz yok.');
                }
                await this.subscriptionEntitlement.assertFamilyEntitled(target.familyId);
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
                        ? Math.max(1, Math.ceil((senderRecent.createdAt.getTime() + 60_000 - Date.now()) /
                            1000))
                        : 60;
                    throw new common_1.HttpException({
                        statusCode: common_1.HttpStatus.TOO_MANY_REQUESTS,
                        error: 'Too Many Requests',
                        code: 'AUDIBLE_WARNING_COOLDOWN_ACTIVE',
                        message: 'Bu kişiye kısa süre önce sesli uyarı gönderildi. Bir süre sonra tekrar deneyin.',
                        retryAfterSeconds,
                    }, common_1.HttpStatus.TOO_MANY_REQUESTS);
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
        }
        catch (error) {
            if (!(error instanceof client_1.Prisma.PrismaClientKnownRequestError) ||
                error.code !== 'P2002') {
                throw error;
            }
            const warning = await this.prisma.audibleWarning.findUnique({
                where: {
                    senderId_targetUserId_eventId: { senderId, targetUserId, eventId },
                },
                select: { id: true },
            });
            if (!warning)
                throw error;
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
                await this.notificationsService.sendOneSignalNotification([targetUserId], 'ACIL SESLI UYARI!', `${result.senderName} size sesli uyari gonderdi!`, {
                    action: 'play_warning_sound',
                    senderName: result.senderName,
                    warningId: result.warning.id,
                });
            }
            catch (error) {
                this.logger.error(`Sesli uyari push teslimi basarisiz: warningId=${result.warning.id}`, error instanceof Error ? error.stack : undefined);
            }
        }
        return {
            success: true,
            warningId: result.warning.id,
            idempotent: result.idempotent,
        };
    }
    async ackAudibleWarning(authenticatedUserId, dto) {
        if (!['received', 'muted', 'unanswered'].includes(dto.action)) {
            throw new common_1.BadRequestException('Gecersiz sesli uyari action degeri.');
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
            if (!warning)
                throw new common_1.NotFoundException('Sesli uyari bulunamadi.');
            await this.subscriptionEntitlement.assertFamilyEntitled(warning.familyId);
            if (warning.targetUserId !== authenticatedUserId) {
                throw new common_1.ForbiddenException('Bu sesli uyarinin hedefi degilsiniz.');
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
            if (senderMember?.memberType !== client_1.MemberType.guardian ||
                !targetMember ||
                (targetMember.memberType !== client_1.MemberType.child &&
                    targetMember.memberType !== client_1.MemberType.elder)) {
                throw new common_1.ForbiddenException('Sesli uyari iliskisi gecersiz.');
            }
            const allowedStatuses = dto.action === 'received'
                ? [client_1.AudibleWarningStatus.pending]
                : [client_1.AudibleWarningStatus.pending, client_1.AudibleWarningStatus.received];
            if (!allowedStatuses.includes(warning.status)) {
                return { processed: false, warning };
            }
            const update = await tx.audibleWarning.updateMany({
                where: { id: warning.id, status: { in: allowedStatuses } },
                data: { status: dto.action, acknowledgedAt: new Date() },
            });
            if (update.count !== 1)
                return { processed: false, warning };
            if (dto.action === client_1.AudibleWarningStatus.unanswered) {
                await tx.alert.create({
                    data: {
                        familyId: warning.familyId,
                        userId: warning.targetUserId,
                        type: client_1.AlertType.sos,
                        title: 'Sesli Uyarı Yanıtsız Kaldı',
                        message: `${warning.target.name} sesli uyarıya yanit vermedi.`,
                        metadata: { senderId: warning.senderId },
                        audibleWarningId: warning.id,
                    },
                });
            }
            return { processed: true, warning };
        });
        if (!result.processed)
            return { success: true, duplicate: true };
        this.locationsGateway.sendEventToUser(result.warning.senderId, 'audible_warning_status', {
            warningId: result.warning.id,
            childId: result.warning.targetUserId,
            childName: result.warning.target.name,
            status: dto.action,
            deliveredAt: new Date(),
        });
        if (dto.action === client_1.AudibleWarningStatus.unanswered) {
            await this.notificationsService.sendFamilyNotification(result.warning.familyId, result.warning.targetUserId, 'Sesli Uyarı Yanıtsız Kaldı', `${result.warning.target.name} sesli uyarıya yanit vermedi.`, {
                action: 'audible_warning_unanswered',
                childId: result.warning.targetUserId,
                warningId: result.warning.id,
            });
        }
        return { success: true, duplicate: false };
    }
    async triggerTestLocationEvent(userId, familyId, targetUserId) {
        const isMember = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId,
                    userId,
                },
            },
        });
        if (!isMember || isMember.memberType !== 'guardian') {
            throw new common_1.ForbiddenException('Bu işlem için veli yetkisi gereklidir.');
        }
        const targetMember = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId,
                    userId: targetUserId,
                },
            },
        });
        if (!targetMember) {
            throw new common_1.NotFoundException('Hedef kullanıcı bu aile grubunda bulunamadı.');
        }
        return { success: true };
    }
};
exports.LocationsService = LocationsService;
exports.LocationsService = LocationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        locations_gateway_1.LocationsGateway,
        notifications_service_1.NotificationsService,
        subscription_entitlement_service_1.SubscriptionEntitlementService])
], LocationsService);
//# sourceMappingURL=locations.service.js.map