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
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const locations_gateway_1 = require("../locations/locations.gateway");
let NotificationsService = class NotificationsService {
    prisma;
    locationsGateway;
    logger = new common_1.Logger('NotificationsService');
    constructor(prisma, locationsGateway) {
        this.prisma = prisma;
        this.locationsGateway = locationsGateway;
    }
    async sendNotification(userId, title, message, data) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { name: true, email: true },
        });
        const userName = user ? user.name : 'Bilinmeyen Kullanıcı';
        this.logger.log(`[FCM SIMULASYONU] Bildirim Gönderilen Kullanıcı: ${userName} (${userId}) | Başlık: "${title}" | Mesaj: "${message}" | Ek Veri: ${JSON.stringify(data || {})}`);
        return { success: true, userId, title, message };
    }
    async sendFamilyNotification(familyId, senderId, title, message, data) {
        const members = await this.prisma.familyMember.findMany({
            where: {
                familyId,
                userId: { not: senderId },
            },
            select: {
                userId: true,
            },
        });
        this.logger.log(`[FCM SIMULASYONU] Aile Grubu (${familyId}) Bildirimi Tetiklendi. Gönderici: ${senderId} | Alıcı Sayısı: ${members.length}`);
        this.locationsGateway.sendAlertNotification(familyId, {
            title,
            message,
            senderId,
            data,
            createdAt: new Date(),
        });
        const promises = members.map((member) => this.sendNotification(member.userId, title, message, data));
        await Promise.all(promises);
        return { success: true, recipientsCount: members.length };
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        locations_gateway_1.LocationsGateway])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map