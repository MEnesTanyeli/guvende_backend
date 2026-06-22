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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationsGateway = void 0;
const websockets_1 = require("@nestjs/websockets");
const common_1 = require("@nestjs/common");
const socket_io_1 = require("socket.io");
const prisma_service_1 = require("../prisma/prisma.service");
const jwt_1 = require("@nestjs/jwt");
const https = __importStar(require("https"));
let LocationsGateway = class LocationsGateway {
    prisma;
    jwtService;
    logger = new common_1.Logger('LocationsGateway');
    activeUsers = new Map();
    server;
    constructor(prisma, jwtService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
    }
    isUserConnected(userId) {
        const userSockets = this.activeUsers.get(userId);
        return !!(userSockets && userSockets.size > 0);
    }
    async sendPushNotification(userIds, title, message, data) {
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
            priority: 10,
        };
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
                    this.logger.log(`LocationsGateway OneSignal Push Gönderim Sonucu: ${res.statusCode} | Gövde: ${responseBody}`);
                    resolve({ statusCode: res.statusCode, body: responseBody });
                });
            });
            req.on('error', (err) => {
                this.logger.error(`LocationsGateway OneSignal Push Gönderimi Hata Aldı: ${err.message}`);
                resolve({ error: err.message });
            });
            req.write(payloadStr);
            req.end();
        });
    }
    async sendSilentPushNotification(userIds, data) {
        const appId = process.env.ONESIGNAL_APP_ID;
        const apiKey = process.env.ONESIGNAL_REST_API_KEY;
        if (!appId || !apiKey) {
            this.logger.warn('OneSignal App ID veya REST API Key eksik. Silent push bildirim gönderilemedi.');
            return;
        }
        if (userIds.length === 0) {
            return;
        }
        const payload = {
            app_id: appId,
            include_external_user_ids: userIds,
            data: data || {},
            content_available: true,
            priority: 10,
        };
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
                    this.logger.log(`LocationsGateway Silent OneSignal Push Gönderim Sonucu: ${res.statusCode} | Gövde: ${responseBody}`);
                    resolve({ statusCode: res.statusCode, body: responseBody });
                });
            });
            req.on('error', (err) => {
                this.logger.error(`LocationsGateway Silent OneSignal Push Gönderimi Hata Aldı: ${err.message}`);
                resolve({ error: err.message });
            });
            req.write(payloadStr);
            req.end();
        });
    }
    async handleConnection(client) {
        try {
            const authHeader = client.handshake.auth?.token || client.handshake.headers?.authorization;
            let token = '';
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.split(' ')[1];
            }
            else {
                const queryToken = client.handshake.query.token;
                if (queryToken) {
                    token = queryToken;
                }
            }
            if (!token) {
                this.logger.warn(`Soket bağlantısı reddedildi: Token bulunamadı. Cihaz: ${client.id}`);
                client.disconnect(true);
                return;
            }
            const payload = this.jwtService.verify(token, {
                secret: process.env.JWT_SECRET || 'guvende_gizli_anahtar_uretimde_degistirin',
            });
            const userId = payload.sub;
            if (!userId) {
                this.logger.warn(`Soket bağlantısı reddedildi: Geçersiz token payloadı. Cihaz: ${client.id}`);
                client.disconnect(true);
                return;
            }
            client.data.userId = userId;
            let userSockets = this.activeUsers.get(userId);
            if (!userSockets) {
                userSockets = new Set();
                this.activeUsers.set(userId, userSockets);
            }
            userSockets.add(client.id);
            this.logger.log(`Kullanıcı (${userId}) soket bağlantısı kurdu: ${client.id}`);
            await this.updateUserConnectionStatus(userId, 'online');
        }
        catch (err) {
            this.logger.error(`Soket bağlantısı doğrulanamadı: ${err.message}. Cihaz: ${client.id}`);
            client.disconnect(true);
        }
    }
    async handleDisconnect(client) {
        const userId = client.data.userId;
        if (userId) {
            const userSockets = this.activeUsers.get(userId);
            if (userSockets) {
                userSockets.delete(client.id);
                this.logger.log(`Kullanıcı (${userId}) bir soket bağlantısını kapattı: ${client.id}`);
                if (userSockets.size === 0) {
                    this.activeUsers.delete(userId);
                    this.logger.log(`Kullanıcı (${userId}) tamamen ayrıldı. Veritabanı çevrimdışı yapılıyor...`);
                    await this.updateUserConnectionStatus(userId, 'offline');
                    await this.broadcastUserOffline(userId);
                }
            }
        }
        else {
            this.logger.log(`Soket bağlantısı kesildi (anonim/yetkisiz): ${client.id}`);
        }
    }
    async updateUserConnectionStatus(userId, status) {
        try {
            const lastLoc = await this.prisma.location.findFirst({
                where: { userId },
                orderBy: { recordedAt: 'desc' },
            });
            if (lastLoc) {
                await this.prisma.location.update({
                    where: { id: lastLoc.id },
                    data: { connectionStatus: status },
                });
                this.logger.log(`Kullanıcının (${userId}) son konum bağlantı durumu güncellendi: ${status}`);
            }
        }
        catch (err) {
            this.logger.error(`Bağlantı durumu güncellenirken hata oluştu (userId: ${userId}):`, err);
        }
    }
    async broadcastUserOffline(userId) {
        try {
            const memberships = await this.prisma.familyMember.findMany({
                where: { userId },
                select: { familyId: true },
            });
            for (const membership of memberships) {
                const room = `family_${membership.familyId}`;
                this.server.to(room).emit('user_offline', { userId });
                this.logger.log(`Odaya (${room}) kullanıcının çevrimdışı olduğu bildirildi: ${userId}`);
            }
        }
        catch (err) {
            this.logger.error(`Çevrimdışı yayını yapılırken hata oluştu (userId: ${userId}):`, err);
        }
    }
    async handleJoinFamily(data, client) {
        const userId = client.data.userId;
        if (!userId) {
            this.logger.warn(`Odaya katılım reddedildi: Kullanıcı kimliği doğrulanmamış.`);
            return { status: 'error', message: 'Yetkisiz erişim.' };
        }
        const isMember = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId: data.familyId,
                    userId: userId,
                },
            },
        });
        if (!isMember) {
            this.logger.warn(`Kullanıcı (${userId}) üye olmadığı odaya katılmaya çalıştı: family_${data.familyId}`);
            return { status: 'error', message: 'Bu aile odasına katılma yetkiniz yok.' };
        }
        const room = `family_${data.familyId}`;
        client.join(room);
        this.logger.log(`İstemci (${client.id}), odaya katıldı: ${room}`);
        return { status: 'success', room };
    }
    async handleLeaveFamily(data, client) {
        const userId = client.data.userId;
        if (!userId) {
            return { status: 'error', message: 'Yetkisiz erişim' };
        }
        const room = `family_${data.familyId}`;
        client.leave(room);
        this.logger.log(`İstemci (${client.id} - ${userId}), odadan ayrıldı: ${room}`);
        return { status: 'success', room };
    }
    async handleSendDeviceLock(data, client) {
        const senderId = client.data.userId;
        if (!senderId) {
            return { status: 'error', message: 'Yetkisiz erişim.' };
        }
        const { targetUserId, lockState } = data;
        if (!targetUserId) {
            return { status: 'error', message: 'Hedef kullanıcı belirtilmedi.' };
        }
        const isAuthorized = await this.prisma.familyMember.findFirst({
            where: {
                userId: senderId,
                memberType: 'guardian',
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
            this.logger.warn(`Kullanıcı (${senderId}) yetkisi olmadan üye (${targetUserId}) için cihaz kilidi sinyali göndermeye çalıştı.`);
            return { status: 'error', message: 'Bu üyeye cihaz kilidi sinyali gönderme yetkiniz yok.' };
        }
        await this.prisma.user.update({
            where: { id: targetUserId },
            data: { isLocked: lockState }
        });
        const sender = await this.prisma.user.findUnique({
            where: { id: senderId },
            select: { name: true },
        });
        const sent = this.sendEventToUser(targetUserId, 'device_lock_trigger', {
            lockState,
            senderName: sender?.name || 'Veliniz',
            senderId,
        });
        await this.sendPushNotification([targetUserId], lockState ? '🔒 Cihazınız Kilitlendi' : '🔓 Cihazınızın Kilidi Açıldı', lockState
            ? `${sender?.name || 'Veliniz'} cihazınızı uzaktan kilitledi.`
            : `${sender?.name || 'Veliniz'} cihazınızın kilidini açtı.`, {
            action: 'device_lock',
            lockState,
            senderName: sender?.name || 'Veliniz',
            senderId,
        });
        if (sent) {
            return { status: 'success', message: `Cihaz kilidi durumu başarıyla iletildi.` };
        }
        else {
            return { status: 'success', message: 'Üye şu anda çevrimdışı, ancak kilit durumu kaydedildi ve push bildirim gönderildi.' };
        }
    }
    sendLocationUpdate(familyId, locationData) {
        const room = `family_${familyId}`;
        this.server.to(room).emit('location_update', locationData);
        this.logger.log(`Odaya (${room}) yeni konum yayını yapıldı: ${JSON.stringify(locationData.userId)}`);
    }
    async sendAlertNotification(familyId, alertData) {
        try {
            const senderId = alertData.senderId || alertData.userId || alertData.data?.userId;
            const guardians = await this.prisma.familyMember.findMany({
                where: {
                    familyId,
                    memberType: 'guardian',
                },
                select: {
                    userId: true,
                },
            });
            let targetGuardians = guardians;
            if (senderId) {
                targetGuardians = guardians.filter(g => g.userId !== senderId);
            }
            for (const guardian of targetGuardians) {
                this.sendEventToUser(guardian.userId, 'alert_notification', alertData);
            }
            this.logger.log(`Aile Grubu (${familyId}) için velilere (${targetGuardians.length} kişi) alarm bildirimi iletildi: ${alertData.title}`);
        }
        catch (err) {
            this.logger.error(`Alarm bildirimi velilere gönderilirken hata oluştu: ${err.message}`);
        }
    }
    sendEventToUser(userId, event, data) {
        const sockets = this.activeUsers.get(userId);
        if (sockets && sockets.size > 0) {
            for (const socketId of sockets) {
                this.server.to(socketId).emit(event, data);
            }
            this.logger.log(`Kullanıcıya (${userId}) özel soket event'i gönderildi: ${event}`);
            return true;
        }
        this.logger.warn(`Kullanıcı (${userId}) çevrimiçi olmadığı için soket event'i gönderilemedi: ${event}`);
        return false;
    }
};
exports.LocationsGateway = LocationsGateway;
__decorate([
    (0, websockets_1.WebSocketServer)(),
    __metadata("design:type", socket_io_1.Server)
], LocationsGateway.prototype, "server", void 0);
__decorate([
    (0, websockets_1.SubscribeMessage)('joinFamily'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], LocationsGateway.prototype, "handleJoinFamily", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('leaveFamily'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], LocationsGateway.prototype, "handleLeaveFamily", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('sendDeviceLock'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, socket_io_1.Socket]),
    __metadata("design:returntype", Promise)
], LocationsGateway.prototype, "handleSendDeviceLock", null);
exports.LocationsGateway = LocationsGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: '*',
        },
    }),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService])
], LocationsGateway);
//# sourceMappingURL=locations.gateway.js.map