"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const locations_gateway_1 = require("../locations/locations.gateway");
const https = __importStar(require("https"));
let NotificationsService = class NotificationsService {
    prisma;
    locationsGateway;
    logger = new common_1.Logger('NotificationsService');
    constructor(prisma, locationsGateway) {
        this.prisma = prisma;
        this.locationsGateway = locationsGateway;
    }
    async sendOneSignalNotification(userIds, title, message, data) {
        const appId = process.env.ONESIGNAL_APP_ID;
        const apiKey = process.env.ONESIGNAL_REST_API_KEY;
        if (!appId || !apiKey) {
            this.logger.warn('OneSignal App ID veya REST API Key eksik. Push bildirim gönderilemedi.');
            return;
        }
        if (userIds.length === 0) {
            return;
        }
        const payload = {
            app_id: appId,
            include_external_user_ids: userIds,
            headings: { tr: title, en: title },
            contents: { tr: message, en: message },
            data: data || {},
        };
        if (data && data.action === 'play_warning_sound') {
            payload.buttons = [
                { id: 'mute_warning', text: 'Sustur', icon: '' }
            ];
            payload.android_ongoing = true;
        }
        const payloadStr = JSON.stringify(payload);
        const options = {
            hostname: 'onesignal.com',
            port: 443,
            path: '/api/v1/notifications',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Authorization': `Basic ${apiKey}`,
                'Content-Length': Buffer.byteLength(payloadStr),
            },
        };
        return new Promise((resolve) => {
            const req = https.request(options, (res) => {
                let responseBody = '';
                res.on('data', (chunk) => {
                    responseBody += chunk;
                });
                res.on('end', () => {
                    this.logger.log(`OneSignal Push Gönderim Sonucu: ${res.statusCode} | Gövde: ${responseBody}`);
                    resolve({ statusCode: res.statusCode, body: responseBody });
                });
            });
            req.on('error', (err) => {
                this.logger.error(`OneSignal Push Gönderimi Hata Aldı: ${err.message}`);
                resolve({ error: err.message });
            });
            req.write(payloadStr);
            req.end();
        });
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
        const sender = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId,
                    userId: senderId,
                },
            },
            select: {
                memberType: true,
            },
        });
        const members = await this.prisma.familyMember.findMany({
            where: {
                familyId,
                userId: { not: senderId },
                muteNotifications: false,
                memberType: 'guardian',
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
            senderRole: sender?.memberType,
            data,
            createdAt: new Date(),
        });
        let targetUserIds = members.map((member) => member.userId);
        if (senderId) {
            targetUserIds = targetUserIds.filter(id => id !== senderId);
        }
        if (targetUserIds.length > 0) {
            await this.sendOneSignalNotification(targetUserIds, title, message, data);
        }
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