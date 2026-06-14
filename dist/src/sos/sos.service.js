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
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const notifications_service_1 = require("../notifications/notifications.service");
const locations_gateway_1 = require("../locations/locations.gateway");
function toTitleCase(str) {
    if (!str)
        return '';
    return str.toLowerCase().split(' ')
        .map(w => {
        if (!w)
            return '';
        let first = w.charAt(0);
        if (first === 'i')
            first = 'İ';
        else if (first === 'ı')
            first = 'I';
        else
            first = first.toUpperCase();
        return first + w.slice(1);
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
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { name: true },
        });
        if (!user) {
            throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
        }
        const memberships = await this.prisma.familyMember.findMany({
            where: { userId },
            select: { familyId: true },
        });
        if (memberships.length === 0) {
            throw new common_1.BadRequestException('Herhangi bir aile grubuna üye değilsiniz. SOS tetiklenemez.');
        }
        const sosEvents = [];
        for (const membership of memberships) {
            const familyId = membership.familyId;
            const sosEvent = await this.prisma.sosEvent.create({
                data: {
                    userId,
                    familyId,
                    latitude: dto.latitude,
                    longitude: dto.longitude,
                    message: dto.message || 'Yardıma ihtiyacım var!',
                },
            });
            sosEvents.push(sosEvent);
            const alertTitle = 'ACİL DURUM (SOS) UYARISI!';
            const displayName = toTitleCase(user.name);
            const alertMsg = `${displayName}: "${dto.message || 'Yardıma ihtiyacım var!'}" (Konum: ${dto.latitude}, ${dto.longitude})`;
            const alert = await this.prisma.alert.create({
                data: {
                    familyId,
                    userId,
                    type: client_1.AlertType.sos,
                    title: alertTitle,
                    message: alertMsg,
                    status: client_1.AlertStatus.active,
                    metadata: {
                        latitude: dto.latitude,
                        longitude: dto.longitude,
                        sosEventId: sosEvent.id,
                        message: dto.message,
                    },
                },
            });
            await this.notificationsService.sendFamilyNotification(familyId, userId, alertTitle, alertMsg, {
                type: 'sos',
                userId,
                latitude: dto.latitude,
                longitude: dto.longitude,
                sosEventId: sosEvent.id,
            });
            this.locationsGateway.sendLocationUpdate(familyId, {
                userId,
                latitude: dto.latitude,
                longitude: dto.longitude,
                sosEventId: sosEvent.id,
                isSos: true,
                message: dto.message || 'ACİL DURUM!',
                recordedAt: new Date(),
                user: { id: userId, name: user.name },
            });
        }
        return {
            message: 'SOS çağrısı başarıyla tüm aile gruplarına iletildi.',
            events: sosEvents,
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