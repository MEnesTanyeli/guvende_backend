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
exports.BatteryService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const notifications_service_1 = require("../notifications/notifications.service");
const subscription_entitlement_service_1 = require("../common/subscription-entitlement.service");
let BatteryService = class BatteryService {
    prisma;
    notificationsService;
    subscriptionEntitlement;
    constructor(prisma, notificationsService, subscriptionEntitlement) {
        this.prisma = prisma;
        this.notificationsService = notificationsService;
        this.subscriptionEntitlement = subscriptionEntitlement;
    }
    isTrackableMember(member) {
        return (member.memberType === client_1.MemberType.child ||
            member.memberType === client_1.MemberType.elder ||
            member.guardianTrackingEnabled);
    }
    async updateBattery(userId, dto) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { name: true },
        });
        if (!user) {
            throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
        }
        const lastLoc = await this.prisma.location.findFirst({
            where: { userId },
            orderBy: { recordedAt: 'desc' },
        });
        if (!lastLoc) {
            throw new common_1.BadRequestException('Batarya durumu güncellenmeden önce en az bir konum kaydı (koordinat içeren) bulunmalıdır.');
        }
        await this.prisma.location.create({
            data: {
                userId,
                latitude: lastLoc.latitude,
                longitude: lastLoc.longitude,
                accuracy: lastLoc.accuracy,
                speed: lastLoc.speed,
                batteryLevel: dto.batteryLevel,
                isCharging: dto.isCharging,
                connectionStatus: lastLoc.connectionStatus,
            },
        });
        const memberships = await this.prisma.familyMember.findMany({
            where: { userId },
            select: {
                familyId: true,
                memberType: true,
                guardianTrackingEnabled: true,
            },
        });
        const trackableMemberships = (await Promise.all(memberships
            .filter((membership) => this.isTrackableMember(membership))
            .map(async (membership) => ({
            membership,
            entitled: await this.subscriptionEntitlement.isFamilyEntitled(membership.familyId),
        }))))
            .filter(({ entitled }) => entitled)
            .map(({ membership }) => membership);
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
                dedupeActiveByUser: true,
            });
        }
        else if (dto.batteryLevel > 15 || dto.isCharging) {
            await this.notificationsService.resolveActiveAlerts(userId, client_1.AlertType.low_battery);
        }
        return {
            message: 'Batarya durumu başarıyla güncellendi.',
            batteryLevel: dto.batteryLevel,
            isCharging: dto.isCharging,
        };
    }
};
exports.BatteryService = BatteryService;
exports.BatteryService = BatteryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notifications_service_1.NotificationsService,
        subscription_entitlement_service_1.SubscriptionEntitlementService])
], BatteryService);
//# sourceMappingURL=battery.service.js.map