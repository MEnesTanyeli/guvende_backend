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
const locations_gateway_1 = require("./locations.gateway");
const client_1 = require("@prisma/client");
const notifications_service_1 = require("../notifications/notifications.service");
let LocationsService = class LocationsService {
    prisma;
    locationsGateway;
    notificationsService;
    logger = new common_1.Logger('LocationsService');
    constructor(prisma, locationsGateway, notificationsService) {
        this.prisma = prisma;
        this.locationsGateway = locationsGateway;
        this.notificationsService = notificationsService;
    }
    getDistanceInMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) *
                Math.cos(lat2 * (Math.PI / 180)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    async recordLocation(userId, dto) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { name: true },
        });
        if (!user) {
            throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
        }
        const isStale = dto.recordedAt
            ? Date.now() - new Date(dto.recordedAt).getTime() > 5 * 60 * 1000
            : false;
        const prevLocation = await this.prisma.location.findFirst({
            where: { userId },
            orderBy: { recordedAt: 'desc' },
        });
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
        await this.prisma.alert.updateMany({
            where: {
                userId,
                type: client_1.AlertType.connection_lost,
                status: client_1.AlertStatus.active,
            },
            data: {
                status: client_1.AlertStatus.resolved,
                resolvedAt: new Date(),
            },
        });
        const memberships = await this.prisma.familyMember.findMany({
            where: { userId },
            select: { familyId: true },
        });
        for (const membership of memberships) {
            const familyId = membership.familyId;
            const safeZones = await this.prisma.safeZone.findMany({
                where: { familyId },
            });
            let insideZoneName = dto.insideZoneName || null;
            let insideZoneId = dto.insideZoneId || null;
            if (!insideZoneName && safeZones.length > 0) {
                for (const zone of safeZones) {
                    const newDist = this.getDistanceInMeters(dto.latitude, dto.longitude, zone.latitude, zone.longitude);
                    if (newDist <= zone.radius) {
                        insideZoneName = zone.name;
                        insideZoneId = zone.id;
                        break;
                    }
                }
            }
            let prevZoneId = null;
            if (prevLocation && safeZones.length > 0) {
                for (const zone of safeZones) {
                    const prevDist = this.getDistanceInMeters(prevLocation.latitude, prevLocation.longitude, zone.latitude, zone.longitude);
                    if (prevDist <= zone.radius) {
                        prevZoneId = zone.id;
                        break;
                    }
                }
            }
            let alertTriggered = false;
            if (insideZoneId && prevZoneId !== insideZoneId) {
                const zone = safeZones.find((z) => z.id === insideZoneId);
                if (zone) {
                    const alertTitle = 'Güvenli Bölgeye Giriş';
                    const alertMsg = `${user.name}, "${zone.name}" güvenli bölgesine giriş yaptı.`;
                    await this.prisma.alert.create({
                        data: {
                            familyId,
                            userId,
                            type: client_1.AlertType.safe_zone_enter,
                            title: alertTitle,
                            message: alertMsg,
                            metadata: { safeZoneId: zone.id, safeZoneName: zone.name },
                        },
                    });
                    alertTriggered = true;
                    if (!isStale) {
                        await this.notificationsService.sendFamilyNotification(familyId, userId, alertTitle, alertMsg, { type: 'safe_zone_enter', userId, zoneId: zone.id });
                    }
                }
            }
            if (prevZoneId && insideZoneId !== prevZoneId) {
                const zone = safeZones.find((z) => z.id === prevZoneId);
                if (zone) {
                    let confirmExit = true;
                    if (!isStale) {
                        const recentLocations = await this.prisma.location.findMany({
                            where: { userId },
                            orderBy: { recordedAt: 'desc' },
                            take: 3,
                        });
                        if (recentLocations.length >= 3) {
                            const insidePoints = recentLocations.filter((loc) => {
                                const dist = this.getDistanceInMeters(loc.latitude, loc.longitude, zone.latitude, zone.longitude);
                                return dist <= zone.radius;
                            });
                            if (insidePoints.length > 0) {
                                confirmExit = false;
                                this.logger.log(`Geofence çıkışı doğrulanmadı (Drift Guard). Son 3 konumdan ${insidePoints.length} tanesi hala bölge içinde.`);
                            }
                        }
                    }
                    if (confirmExit) {
                        const alertTitle = 'Güvenli Bölgeden Çıkış';
                        const alertMsg = `${user.name}, "${zone.name}" güvenli bölgesinden çıkış yaptı!`;
                        await this.prisma.alert.create({
                            data: {
                                familyId,
                                userId,
                                type: client_1.AlertType.safe_zone_exit,
                                title: alertTitle,
                                message: alertMsg,
                                metadata: { safeZoneId: zone.id, safeZoneName: zone.name },
                            },
                        });
                        alertTriggered = true;
                        if (!isStale) {
                            await this.notificationsService.sendFamilyNotification(familyId, userId, alertTitle, alertMsg, { type: 'safe_zone_exit', userId, zoneId: zone.id });
                        }
                    }
                }
            }
            if (!isStale && !alertTriggered) {
                const lastGeofenceAlert = await this.prisma.alert.findFirst({
                    where: {
                        userId,
                        familyId,
                        type: { in: [client_1.AlertType.safe_zone_enter, client_1.AlertType.safe_zone_exit] },
                    },
                    orderBy: { createdAt: 'desc' },
                });
                if (lastGeofenceAlert?.type === client_1.AlertType.safe_zone_enter && !insideZoneId) {
                    const lastZoneName = lastGeofenceAlert.metadata
                        ? lastGeofenceAlert.metadata.safeZoneName
                        : 'Güvenli Bölge';
                    const lastZoneId = lastGeofenceAlert.metadata
                        ? lastGeofenceAlert.metadata.safeZoneId
                        : null;
                    const alertTitle = 'Güvenli Bölgeden Çıkış';
                    const alertMsg = `${user.name}, "${lastZoneName}" güvenli bölgesinden çıkış yaptı!`;
                    await this.prisma.alert.create({
                        data: {
                            familyId,
                            userId,
                            type: client_1.AlertType.safe_zone_exit,
                            title: alertTitle,
                            message: alertMsg,
                            metadata: { safeZoneId: lastZoneId, safeZoneName: lastZoneName, delayedTrigger: true },
                        },
                    });
                    await this.notificationsService.sendFamilyNotification(familyId, userId, alertTitle, alertMsg, { type: 'safe_zone_exit', userId, zoneId: lastZoneId });
                }
                else if ((!lastGeofenceAlert || lastGeofenceAlert.type === client_1.AlertType.safe_zone_exit) &&
                    insideZoneId) {
                    const zone = safeZones.find((z) => z.id === insideZoneId);
                    if (zone) {
                        const alertTitle = 'Güvenli Bölgeye Giriş';
                        const alertMsg = `${user.name}, "${zone.name}" güvenli bölgesine giriş yaptı.`;
                        await this.prisma.alert.create({
                            data: {
                                familyId,
                                userId,
                                type: client_1.AlertType.safe_zone_enter,
                                title: alertTitle,
                                message: alertMsg,
                                metadata: { safeZoneId: zone.id, safeZoneName: zone.name, delayedTrigger: true },
                            },
                        });
                        await this.notificationsService.sendFamilyNotification(familyId, userId, alertTitle, alertMsg, { type: 'safe_zone_enter', userId, zoneId: zone.id });
                    }
                }
            }
            const broadcastData = {
                ...newLocation,
                insideZoneName,
            };
            this.locationsGateway.sendLocationUpdate(familyId, broadcastData);
        }
        if (dto.batteryLevel !== undefined) {
            if (dto.batteryLevel <= 15 && !dto.isCharging) {
                const activeBatteryAlert = await this.prisma.alert.findFirst({
                    where: {
                        userId,
                        type: client_1.AlertType.low_battery,
                        status: client_1.AlertStatus.active,
                    },
                });
                if (!activeBatteryAlert) {
                    const alertTitle = 'Düşük Şarj Uyarısı';
                    const alertMsg = `${user.name} adlı aile üyesinin şarjı %${dto.batteryLevel} seviyesine düştü!`;
                    for (const membership of memberships) {
                        await this.prisma.alert.create({
                            data: {
                                familyId: membership.familyId,
                                userId,
                                type: client_1.AlertType.low_battery,
                                title: alertTitle,
                                message: alertMsg,
                                metadata: { batteryLevel: dto.batteryLevel },
                            },
                        });
                        if (!isStale) {
                            await this.notificationsService.sendFamilyNotification(membership.familyId, userId, alertTitle, alertMsg, { type: 'low_battery', userId, batteryLevel: dto.batteryLevel });
                        }
                    }
                }
            }
            else if (dto.batteryLevel > 15 || dto.isCharging) {
                await this.prisma.alert.updateMany({
                    where: {
                        userId,
                        type: client_1.AlertType.low_battery,
                        status: client_1.AlertStatus.active,
                    },
                    data: {
                        status: client_1.AlertStatus.resolved,
                        resolvedAt: new Date(),
                    },
                });
            }
        }
        return newLocation;
    }
    async recordBulkLocations(userId, dto) {
        const { locations } = dto;
        if (!locations || locations.length === 0) {
            return { success: true, count: 0 };
        }
        const sortedLocations = [...locations].sort((a, b) => {
            const timeA = a.recordedAt ? new Date(a.recordedAt).getTime() : 0;
            const timeB = b.recordedAt ? new Date(b.recordedAt).getTime() : 0;
            return timeA - timeB;
        });
        const latestLocationDto = sortedLocations[sortedLocations.length - 1];
        const historicalLocationDtos = sortedLocations.slice(0, sortedLocations.length - 1);
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { id: true },
        });
        if (!user) {
            throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
        }
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
        const savedLatestLocation = await this.recordLocation(userId, latestLocationDto);
        return {
            success: true,
            count: locations.length,
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
        const safeZones = await this.prisma.safeZone.findMany({
            where: { familyId },
        });
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
            let insideZoneName = null;
            for (const zone of safeZones) {
                const dist = this.getDistanceInMeters(myLocation.latitude, myLocation.longitude, zone.latitude, zone.longitude);
                if (dist <= zone.radius) {
                    insideZoneName = zone.name;
                    break;
                }
            }
            return [{ ...myLocation, insideZoneName }];
        }
        const members = await this.prisma.familyMember.findMany({
            where: { familyId },
            select: { userId: true },
        });
        const userIds = members.map((m) => m.userId);
        const latestLocations = await Promise.all(userIds.map(async (uid) => {
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
            if (!loc)
                return null;
            let insideZoneName = null;
            for (const zone of safeZones) {
                const dist = this.getDistanceInMeters(loc.latitude, loc.longitude, zone.latitude, zone.longitude);
                if (dist <= zone.radius) {
                    insideZoneName = zone.name;
                    break;
                }
            }
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
    async sendAudibleWarning(senderId, targetUserId) {
        if (!targetUserId) {
            throw new common_1.NotFoundException('Hedef kullanıcı belirtilmedi.');
        }
        const isAuthorized = await this.prisma.familyMember.findFirst({
            where: {
                userId: senderId,
                memberType: client_1.MemberType.guardian,
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
            throw new common_1.ForbiddenException('Bu üyeye sesli uyarı gönderme yetkiniz yok.');
        }
        const sender = await this.prisma.user.findUnique({
            where: { id: senderId },
            select: { name: true },
        });
        await this.notificationsService.sendOneSignalNotification([targetUserId], '🚨 ACİL SESLİ UYARI!', `${sender?.name || 'Veliniz'} size sesli uyarı gönderdi!`, {
            action: 'play_warning_sound',
            senderName: sender?.name || 'Veliniz',
            senderId,
        });
        return { success: true, message: 'Sesli uyarı push bildirim olarak gönderildi.' };
    }
    async ackAudibleWarning(childId, senderId, action) {
        const child = await this.prisma.user.findUnique({
            where: { id: childId },
            select: { name: true },
        });
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
        this.locationsGateway.sendEventToUser(senderId, 'audible_warning_status', {
            childId,
            childName: child?.name || 'Çocuğunuz',
            status: action,
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
            await this.notificationsService.sendFamilyNotification(sharedMembership.familyId, childId, alertTitle, alertMsg, { action: 'audible_warning_unanswered', childId });
        }
        return { success: true };
    }
    async deleteTodayLocations(userId, familyId, targetUserId) {
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
        notifications_service_1.NotificationsService])
], LocationsService);
//# sourceMappingURL=locations.service.js.map