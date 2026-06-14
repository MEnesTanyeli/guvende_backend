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
let BatteryService = class BatteryService {
    prisma;
    notificationsService;
    constructor(prisma, notificationsService) {
        this.prisma = prisma;
        this.notificationsService = notificationsService;
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
        const newLoc = await this.prisma.location.create({
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
            select: { familyId: true },
        });
        if (dto.batteryLevel <= 15 && !dto.isCharging) {
            const activeAlert = await this.prisma.alert.findFirst({
                where: {
                    userId,
                    type: client_1.AlertType.low_battery,
                    status: client_1.AlertStatus.active,
                },
            });
            if (!activeAlert) {
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
                    await this.notificationsService.sendFamilyNotification(membership.familyId, userId, alertTitle, alertMsg, { type: 'low_battery', userId, batteryLevel: dto.batteryLevel });
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
        notifications_service_1.NotificationsService])
], BatteryService);
//# sourceMappingURL=battery.service.js.map