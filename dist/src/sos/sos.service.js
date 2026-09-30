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
exports.SosService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const notifications_service_1 = require("../notifications/notifications.service");
const locations_gateway_1 = require("../locations/locations.gateway");
const SOS_COOLDOWN_MS = 60_000;
function toTitleCase(value) {
    return value
        .toLowerCase()
        .split(' ')
        .map((word) => {
        if (!word)
            return '';
        let first = word.charAt(0);
        if (first === 'i')
            first = 'İ';
        else if (first === 'ı')
            first = 'I';
        else
            first = first.toUpperCase();
        return first + word.slice(1);
    })
        .join(' ');
}
let SosService = class SosService {
    prisma;
    notificationsService;
    locationsGateway;
    constructor(prisma, notificationsService, locationsGateway) {
        this.prisma = prisma;
        this.notificationsService = notificationsService;
        this.locationsGateway = locationsGateway;
    }
    async triggerSos(userId, dto) {
        let committed;
        try {
            committed = await this.prisma.$transaction(async (tx) => {
                await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`online-sos:${userId}`}, 0))`;
                const user = await tx.user.findUnique({
                    where: { id: userId },
                    select: { name: true },
                });
                if (!user)
                    throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
                const memberships = await tx.familyMember.findMany({
                    where: { userId },
                    select: { familyId: true },
                    orderBy: { familyId: 'asc' },
                });
                if (memberships.length === 0) {
                    throw new common_1.BadRequestException('Herhangi bir aile grubuna üye değilsiniz. SOS tetiklenemez.');
                }
                const familyIds = memberships.map(({ familyId }) => familyId);
                const existing = await tx.sosEvent.findMany({
                    where: { userId, eventId: dto.eventId, familyId: { in: familyIds } },
                    orderBy: { familyId: 'asc' },
                });
                if (existing.length > 0) {
                    return { kind: 'duplicate', events: existing };
                }
                const recent = await tx.sosEvent.findMany({
                    where: {
                        userId,
                        familyId: { in: familyIds },
                        createdAt: { gt: new Date(Date.now() - SOS_COOLDOWN_MS) },
                    },
                    select: { familyId: true, createdAt: true },
                    orderBy: { createdAt: 'desc' },
                });
                const latestByFamily = new Map();
                for (const row of recent) {
                    if (!latestByFamily.has(row.familyId)) {
                        latestByFamily.set(row.familyId, row.createdAt);
                    }
                }
                const eligibleFamilyIds = familyIds.filter((familyId) => !latestByFamily.has(familyId));
                if (eligibleFamilyIds.length === 0) {
                    const retryAfterSeconds = Math.max(1, ...[...latestByFamily.values()].map((createdAt) => Math.ceil((createdAt.getTime() + SOS_COOLDOWN_MS - Date.now()) / 1000)));
                    throw new common_1.HttpException({
                        statusCode: common_1.HttpStatus.TOO_MANY_REQUESTS,
                        error: 'Too Many Requests',
                        code: 'SOS_COOLDOWN_ACTIVE',
                        message: 'Yeni bir SOS göndermeden önce kısa bir süre bekleyin.',
                        retryAfterSeconds,
                    }, common_1.HttpStatus.TOO_MANY_REQUESTS);
                }
                const alertTitle = 'ACİL DURUM (SOS) UYARISI!';
                const sosMessage = dto.message || 'Yardıma ihtiyacım var!';
                const alertMessage = `${toTitleCase(user.name)}: "${sosMessage}" (Konum: ${dto.latitude}, ${dto.longitude})`;
                const results = [];
                for (const familyId of eligibleFamilyIds) {
                    const event = await tx.sosEvent.create({
                        data: {
                            eventId: dto.eventId,
                            userId,
                            familyId,
                            latitude: dto.latitude,
                            longitude: dto.longitude,
                            message: sosMessage,
                        },
                    });
                    await tx.alert.create({
                        data: {
                            familyId,
                            userId,
                            type: client_1.AlertType.sos,
                            title: alertTitle,
                            message: alertMessage,
                            status: client_1.AlertStatus.active,
                            metadata: {
                                latitude: dto.latitude,
                                longitude: dto.longitude,
                                sosEventId: event.id,
                                eventId: dto.eventId,
                                message: dto.message,
                            },
                        },
                    });
                    results.push({ event, familyId, alertTitle, alertMessage });
                }
                return { kind: 'created', events: results };
            });
        }
        catch (error) {
            if (!(error instanceof client_1.Prisma.PrismaClientKnownRequestError) ||
                error.code !== 'P2002') {
                throw error;
            }
            const existing = await this.prisma.sosEvent.findMany({
                where: { userId, eventId: dto.eventId },
                orderBy: { familyId: 'asc' },
            });
            if (existing.length === 0)
                throw error;
            committed = { kind: 'duplicate', events: existing };
        }
        if (committed.kind === 'duplicate') {
            return {
                message: 'SOS çağrısı daha önce tüm aile gruplarına iletildi.',
                events: committed.events,
                idempotent: true,
            };
        }
        await Promise.allSettled(committed.events.map(async ({ event, familyId, alertTitle, alertMessage }) => {
            await this.notificationsService.sendFamilyNotification(familyId, userId, alertTitle, alertMessage, {
                type: 'sos',
                userId,
                latitude: dto.latitude,
                longitude: dto.longitude,
                sosEventId: event.id,
                eventId: dto.eventId,
            });
            await this.locationsGateway.sendLocationUpdate(familyId, {
                userId,
                latitude: dto.latitude,
                longitude: dto.longitude,
                sosEventId: event.id,
                eventId: dto.eventId,
                isSos: true,
                message: dto.message || 'ACİL DURUM!',
                recordedAt: event.createdAt,
            }, true);
        }));
        return {
            message: 'SOS çağrısı başarıyla tüm aile gruplarına iletildi.',
            events: committed.events.map(({ event }) => event),
            idempotent: false,
        };
    }
};
exports.SosService = SosService;
exports.SosService = SosService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notifications_service_1.NotificationsService,
        locations_gateway_1.LocationsGateway])
], SosService);
//# sourceMappingURL=sos.service.js.map