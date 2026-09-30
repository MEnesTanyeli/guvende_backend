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
const subscription_entitlement_service_1 = require("../common/subscription-entitlement.service");
let LocationsGateway = class LocationsGateway {
    prisma;
    jwtService;
    subscriptionEntitlement;
    logger = new common_1.Logger('LocationsGateway');
    activeUsers = new Map();
    server;
    constructor(prisma, jwtService, subscriptionEntitlement) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.subscriptionEntitlement = subscriptionEntitlement;
    }
    disconnectUser(userId) {
        const socketIds = new Set(this.activeUsers.get(userId) ?? []);
        for (const socket of this.server?.sockets.sockets.values() ?? []) {
            if (socket.data.userId === userId)
                socketIds.add(socket.id);
        }
        for (const socketId of socketIds) {
            const socket = this.server?.sockets.sockets.get(socketId);
            if (!socket || socket.data.userId !== userId)
                continue;
            this.disconnectSocket(socket, userId);
        }
    }
    disconnectSessions(userId, sessionIds) {
        const revokedSessionIds = new Set(sessionIds);
        if (revokedSessionIds.size === 0)
            return;
        const socketIds = new Set(this.activeUsers.get(userId) ?? []);
        for (const socket of this.server?.sockets.sockets.values() ?? []) {
            if (socket.data.userId === userId)
                socketIds.add(socket.id);
        }
        for (const socketId of socketIds) {
            const socket = this.server?.sockets.sockets.get(socketId);
            if (!socket ||
                socket.data.userId !== userId ||
                !socket.data.sessionId ||
                !revokedSessionIds.has(socket.data.sessionId)) {
                continue;
            }
            this.disconnectSocket(socket, userId, socket.data.sessionId);
        }
    }
    disconnectSocket(socket, userId, sessionId) {
        try {
            socket.disconnect(true);
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            this.logger.error(`Socket iptal baglantisi kesilemedi: user=${userId} session=${sessionId ?? 'all'} socket=${socket.id}: ${message}`);
        }
    }
    clearFamilyRoom(familyId) {
        const room = `family_${familyId}`;
        this.server?.in(room).socketsLeave(room);
    }
    isUserConnected(userId) {
        const userSockets = this.activeUsers.get(userId);
        return !!(userSockets && userSockets.size > 0);
    }
    async revokeFamilyAccess(userId, familyId) {
        const socketIds = this.activeUsers.get(userId);
        if (!socketIds || socketIds.size === 0)
            return;
        const room = `family_${familyId}`;
        for (const socketId of socketIds) {
            const socket = this.server?.sockets.sockets.get(socketId);
            if (!socket)
                continue;
            try {
                await socket.leave(room);
                this.logger.log(`Kullanici (${userId}) aile odasindan cikarildi: ${room} | socket: ${socketId}`);
            }
            catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                this.logger.error(`Aile odasi erisimi iptal edilemedi: user=${userId} room=${room} socket=${socketId}: ${message}`);
            }
        }
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
                Authorization: `Basic ${apiKey}`,
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
                Authorization: `Basic ${apiKey}`,
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
            const handshakeAuth = client.handshake.auth;
            const authToken = handshakeAuth.token;
            const headerToken = client.handshake.headers.authorization;
            const authHeader = typeof authToken === 'string' ? authToken : headerToken;
            let token = '';
            if (authHeader && authHeader.startsWith('Bearer ')) {
                token = authHeader.split(' ')[1];
            }
            else {
                const queryToken = client.handshake.query.token;
                if (typeof queryToken === 'string') {
                    token = queryToken;
                }
            }
            if (!token) {
                this.logger.warn(`Soket bağlantısı reddedildi: Token bulunamadı. Cihaz: ${client.id}`);
                client.disconnect(true);
                return;
            }
            const payload = this.jwtService.verify(token);
            const userId = payload.sub;
            if (!userId || !payload.sid || payload.typ !== 'access') {
                this.logger.warn(`Soket bağlantısı reddedildi: Geçersiz token payloadı. Cihaz: ${client.id}`);
                client.disconnect(true);
                return;
            }
            const session = await this.prisma.session.findFirst({
                where: {
                    id: payload.sid,
                    userId,
                    revokedAt: null,
                    expiresAt: { gt: new Date() },
                },
                select: { id: true },
            });
            if (!session) {
                this.logger.warn(`Soket bağlantısı reddedildi: Oturum geçersiz. Cihaz: ${client.id}`);
                client.disconnect(true);
                return;
            }
            client.data.userId = userId;
            client.data.sessionId = session.id;
            client.use((_packet, next) => {
                void (async () => {
                    const activeSession = await this.prisma.session.findFirst({
                        where: {
                            id: client.data.sessionId,
                            userId: client.data.userId,
                            revokedAt: null,
                            expiresAt: { gt: new Date() },
                        },
                        select: { id: true },
                    });
                    if (!activeSession) {
                        client.disconnect(true);
                        next(new Error('Oturum kapatılmış veya süresi dolmuş.'));
                        return;
                    }
                    next();
                })();
            });
            if (payload.exp) {
                const remainingMs = Math.max(0, payload.exp * 1000 - Date.now());
                client.data.authExpiryTimer = setTimeout(() => client.disconnect(true), remainingMs);
            }
            let userSockets = this.activeUsers.get(userId);
            if (!userSockets) {
                userSockets = new Set();
                this.activeUsers.set(userId, userSockets);
            }
            userSockets.add(client.id);
            this.logger.log(`Kullanıcı (${userId}) soket bağlantısı kurdu: ${client.id}`);
            await this.updateUserConnectionStatus(userId, 'online');
            const stillActive = await this.prisma.session.findFirst({
                where: {
                    id: session.id,
                    userId,
                    revokedAt: null,
                    expiresAt: { gt: new Date() },
                },
                select: { id: true },
            });
            if (!stillActive)
                client.disconnect(true);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Soket bağlantısı doğrulanamadı: ${message}. Cihaz: ${client.id}`);
            client.disconnect(true);
        }
    }
    async handleDisconnect(client) {
        if (client.data.authExpiryTimer) {
            clearTimeout(client.data.authExpiryTimer);
        }
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
            return {
                status: 'error',
                message: 'Bu aile odasına katılma yetkiniz yok.',
            };
        }
        if (!(await this.subscriptionEntitlement.isFamilyEntitled(data.familyId))) {
            return {
                status: 'error',
                message: 'Bu ailenin premium takip erişimi aktif değil.',
            };
        }
        const room = `family_${data.familyId}`;
        await client.join(room);
        const stillMember = await this.prisma.familyMember.findUnique({
            where: { familyId_userId: { familyId: data.familyId, userId } },
            select: { id: true },
        });
        if (!stillMember) {
            await client.leave(room);
            return { status: 'error', message: 'Aile erisimi kaldirildi.' };
        }
        this.logger.log(`İstemci (${client.id}), odaya katıldı: ${room}`);
        return { status: 'success' };
    }
    async handleJoinAdminControlRoom(client) {
        const userId = client.data.userId;
        if (!userId) {
            return { status: 'error', message: 'Yetkisiz erişim.' };
        }
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });
        if (!user || user.role !== 'admin') {
            return { status: 'error', message: 'Sadece yöneticiler katılabilir.' };
        }
        void client.join('admin_control_room');
        this.logger.log(`İstemci (${client.id}), admin_control_room odasına katıldı.`);
        return { status: 'success' };
    }
    handleLeaveFamily(data, client) {
        const userId = client.data.userId;
        if (!userId) {
            return { status: 'error', message: 'Yetkisiz erişim' };
        }
        const room = `family_${data.familyId}`;
        void client.leave(room);
        this.logger.log(`İstemci (${client.id} - ${userId}), odadan ayrıldı: ${room}`);
        return { status: 'success' };
    }
    handleSendDeviceLock() {
        return {
            status: 'error',
            message: 'Cihaz kilitleme özelliği devre dışı bırakılmıştır.',
        };
    }
    async sendLocationUpdate(familyId, locationData, subscriptionExempt = false) {
        if (!subscriptionExempt &&
            !(await this.subscriptionEntitlement.isFamilyEntitled(familyId))) {
            return;
        }
        const room = `family_${familyId}`;
        const senderId = locationData.userId;
        if (typeof senderId !== 'string') {
            this.logger.warn(`Konum yayini reddedildi: gecerli bir kullanici kimligi yok. family=${familyId}`);
            return;
        }
        const members = await this.prisma.familyMember.findMany({
            where: { familyId },
            select: {
                userId: true,
                memberType: true,
                guardianTrackingEnabled: true,
            },
        });
        const sender = members.find((member) => member.userId === senderId);
        if (!sender) {
            this.logger.warn(`Konum yayini reddedildi: gonderen aile uyesi degil. user=${senderId} family=${familyId}`);
            return;
        }
        const canGuardiansReceive = sender.memberType !== 'guardian' || sender.guardianTrackingEnabled;
        if (canGuardiansReceive) {
            for (const recipient of members) {
                if (recipient.userId === senderId ||
                    recipient.memberType !== 'guardian') {
                    continue;
                }
                const socketIds = this.activeUsers.get(recipient.userId);
                if (!socketIds)
                    continue;
                for (const socketId of socketIds) {
                    const socket = this.server?.sockets.sockets.get(socketId);
                    if (socket?.rooms.has(room)) {
                        socket.emit('location_update', locationData);
                    }
                }
            }
        }
        this.server.to('admin_control_room').emit('location_update', locationData);
        this.logger.log(`Odaya (${room}) ve admin_control_room odasına yeni konum yayını yapıldı: ${JSON.stringify(locationData.userId)}`);
    }
    async sendAlertNotification(familyId, alertData) {
        try {
            if (alertData.type !== 'sos' &&
                !(await this.subscriptionEntitlement.isFamilyEntitled(familyId))) {
                return;
            }
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
                targetGuardians = guardians.filter((g) => g.userId !== senderId);
            }
            for (const guardian of targetGuardians) {
                this.sendEventToUser(guardian.userId, 'alert_notification', alertData);
            }
            this.server
                .to('admin_control_room')
                .emit('alert_notification', alertData);
            this.logger.log(`Aile Grubu (${familyId}) için velilere (${targetGuardians.length} kişi) ve admin_control_room odasına alarm bildirimi iletildi: ${alertData.title}`);
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            this.logger.error(`Alarm bildirimi velilere gönderilirken hata oluştu: ${message}`);
        }
    }
    handleVideoCallRequestDisabled() {
        return {
            status: 'disabled',
            message: 'Goruntulu arama ozelligi gecici olarak kapali.',
        };
    }
    handleVideoCallResponseDisabled() {
        return {
            status: 'disabled',
            message: 'Goruntulu arama ozelligi gecici olarak kapali.',
        };
    }
    handleWebRTCSignalDisabled() {
        return {
            status: 'disabled',
            message: 'Goruntulu arama ozelligi gecici olarak kapali.',
        };
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
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], LocationsGateway.prototype, "handleJoinFamily", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('joinAdminControlRoom'),
    __param(0, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], LocationsGateway.prototype, "handleJoinAdminControlRoom", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('leaveFamily'),
    __param(0, (0, websockets_1.MessageBody)()),
    __param(1, (0, websockets_1.ConnectedSocket)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], LocationsGateway.prototype, "handleLeaveFamily", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('sendDeviceLock'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LocationsGateway.prototype, "handleSendDeviceLock", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('video_call_request'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LocationsGateway.prototype, "handleVideoCallRequestDisabled", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('video_call_response'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LocationsGateway.prototype, "handleVideoCallResponseDisabled", null);
__decorate([
    (0, websockets_1.SubscribeMessage)('webrtc_signal'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], LocationsGateway.prototype, "handleWebRTCSignalDisabled", null);
exports.LocationsGateway = LocationsGateway = __decorate([
    (0, websockets_1.WebSocketGateway)({
        cors: {
            origin: (process.env.CORS_ORIGINS || '')
                .split(',')
                .map((origin) => origin.trim())
                .filter(Boolean),
        },
    }),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        subscription_entitlement_service_1.SubscriptionEntitlementService])
], LocationsGateway);
//# sourceMappingURL=locations.gateway.js.map