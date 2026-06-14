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
exports.CronService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const notifications_service_1 = require("../notifications/notifications.service");
const locations_gateway_1 = require("../locations/locations.gateway");
let CronService = class CronService {
    prisma;
    notificationsService;
    locationsGateway;
    logger = new common_1.Logger('CronService');
    constructor(prisma, notificationsService, locationsGateway) {
        this.prisma = prisma;
        this.notificationsService = notificationsService;
        this.locationsGateway = locationsGateway;
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
    async handleConnectionLostCheck() {
        this.logger.log('Bağlantı kesildi kontrolü zamanlanmış görevi başlatılıyor...');
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const activeMembers = await this.prisma.familyMember.findMany({
            select: { userId: true, familyId: true },
        });
        const userFamiliesMap = new Map();
        activeMembers.forEach((m) => {
            let families = userFamiliesMap.get(m.userId);
            if (!families) {
                families = [];
                userFamiliesMap.set(m.userId, families);
            }
            families.push(m.familyId);
        });
        for (const [userId, familyIds] of userFamiliesMap.entries()) {
            const lastLocation = await this.prisma.location.findFirst({
                where: { userId },
                orderBy: { recordedAt: 'desc' },
            });
            const user = await this.prisma.user.findUnique({
                where: { id: userId },
                select: { name: true },
            });
            const userName = user ? user.name : 'Bilinmeyen Üye';
            if (lastLocation && lastLocation.recordedAt < tenMinutesAgo) {
                const activeAlert = await this.prisma.alert.findFirst({
                    where: {
                        userId,
                        type: client_1.AlertType.connection_lost,
                        status: client_1.AlertStatus.active,
                    },
                });
                if (!activeAlert) {
                    const alertTitle = 'Bağlantı Kesildi';
                    const alertMsg = `${userName} isimli üyenin cihazından 10 dakikadır konum alınamıyor! Bağlantı kesilmiş olabilir.`;
                    for (const familyId of familyIds) {
                        await this.prisma.alert.create({
                            data: {
                                familyId,
                                userId,
                                type: client_1.AlertType.connection_lost,
                                title: alertTitle,
                                message: alertMsg,
                                metadata: {
                                    lastRecordedAt: lastLocation ? lastLocation.recordedAt : null,
                                },
                            },
                        });
                        await this.notificationsService.sendFamilyNotification(familyId, userId, alertTitle, alertMsg, { type: 'connection_lost', userId });
                    }
                    this.logger.warn(`${userName} (${userId}) için bağlantı koptu alarmı oluşturuldu.`);
                }
            }
        }
        this.logger.log('Bağlantı kesildi kontrolü zamanlanmış görevi tamamlandı.');
    }
    async handleInactivityCheck() {
        this.logger.log('Hareketsizlik kontrolü zamanlanmış görevi başlatılıyor...');
        const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        const activeMembers = await this.prisma.familyMember.findMany({
            select: { userId: true, familyId: true },
        });
        const userFamiliesMap = new Map();
        activeMembers.forEach((m) => {
            let families = userFamiliesMap.get(m.userId);
            if (!families) {
                families = [];
                userFamiliesMap.set(m.userId, families);
            }
            families.push(m.familyId);
        });
        for (const [userId, familyIds] of userFamiliesMap.entries()) {
            const locations = await this.prisma.location.findMany({
                where: {
                    userId,
                    recordedAt: { gte: eightHoursAgo },
                },
                orderBy: { recordedAt: 'desc' },
            });
            if (locations.length >= 2 &&
                locations[0].recordedAt >= thirtyMinutesAgo &&
                (locations[0].recordedAt.getTime() - locations[locations.length - 1].recordedAt.getTime() >= 7.5 * 60 * 60 * 1000)) {
                const latestLoc = locations[0];
                const isInactive = locations.every((loc) => {
                    const distance = this.getDistanceInMeters(loc.latitude, loc.longitude, latestLoc.latitude, latestLoc.longitude);
                    return distance <= 20;
                });
                if (isInactive) {
                    const user = await this.prisma.user.findUnique({
                        where: { id: userId },
                        select: { name: true },
                    });
                    const userName = user ? user.name : 'Bilinmeyen Üye';
                    const activeAlert = await this.prisma.alert.findFirst({
                        where: {
                            userId,
                            type: client_1.AlertType.inactivity,
                            status: client_1.AlertStatus.active,
                        },
                    });
                    if (!activeAlert) {
                        const alertTitle = 'Hareketsizlik Uyarısı';
                        const alertMsg = `${userName} son 8 saattir aynı bölgede hareketsiz kalmıştır. Bir durum değişikliği olabilir.`;
                        for (const familyId of familyIds) {
                            await this.prisma.alert.create({
                                data: {
                                    familyId,
                                    userId,
                                    type: client_1.AlertType.inactivity,
                                    title: alertTitle,
                                    message: alertMsg,
                                    metadata: { radius: 20, hours: 8 },
                                },
                            });
                            await this.notificationsService.sendFamilyNotification(familyId, userId, alertTitle, alertMsg, { type: 'inactivity', userId });
                        }
                        this.logger.warn(`${userName} (${userId}) için hareketsizlik alarmı oluşturuldu.`);
                    }
                }
            }
        }
        this.logger.log('Hareketsizlik kontrolü zamanlanmış görevi tamamlandı.');
    }
    async handleMedicationReminderCheck() {
        this.logger.log('İlaç hatırlatıcı kontrolü zamanlanmış görevi başlatılıyor...');
        const localTime = new Date().toLocaleTimeString('tr-TR', {
            hour12: false,
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Istanbul',
        });
        const activeReminders = await this.prisma.medicationReminder.findMany({
            where: {
                time: localTime,
                isActive: true,
            },
            include: {
                user: true,
            },
        });
        const nowInIstanbul = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Istanbul' }));
        const today = new Date(nowInIstanbul.getFullYear(), nowInIstanbul.getMonth(), nowInIstanbul.getDate());
        const filteredReminders = activeReminders.filter(reminder => {
            const start = new Date(reminder.startDate);
            const startDateOnly = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            if (startDateOnly > today) {
                return false;
            }
            if (reminder.repeatDays && reminder.repeatDays > 0) {
                const msPerDay = 24 * 60 * 60 * 1000;
                const diffDays = Math.round((today.getTime() - startDateOnly.getTime()) / msPerDay);
                if (diffDays >= reminder.repeatDays) {
                    return false;
                }
            }
            return true;
        });
        if (filteredReminders.length > 0) {
            this.logger.log(`Saat ${localTime} için ${filteredReminders.length} adet aktif hatırlatıcı tetikleniyor.`);
        }
        for (const reminder of filteredReminders) {
            const sent = this.locationsGateway.sendEventToUser(reminder.userId, 'medication_reminder_trigger', {
                reminderId: reminder.id,
                medicationName: reminder.medicationName,
                dosage: reminder.dosage,
                time: reminder.time,
                reminderType: reminder.reminderType,
            });
            if (sent) {
                this.logger.log(`Hatırlatıcı alarmı (${reminder.medicationName} - ${reminder.reminderType}) kullanıcıya (${reminder.user.name}) iletildi.`);
            }
            else {
                this.logger.warn(`Kullanıcı (${reminder.user.name}) çevrimdışı olduğu için hatırlatıcı alarmı iletilemedi.`);
            }
        }
    }
};
exports.CronService = CronService;
__decorate([
    (0, schedule_1.Cron)('0 */2 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CronService.prototype, "handleConnectionLostCheck", null);
__decorate([
    (0, schedule_1.Cron)('0 */30 * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CronService.prototype, "handleInactivityCheck", null);
__decorate([
    (0, schedule_1.Cron)('0 * * * * *'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], CronService.prototype, "handleMedicationReminderCheck", null);
exports.CronService = CronService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notifications_service_1.NotificationsService,
        locations_gateway_1.LocationsGateway])
], CronService);
//# sourceMappingURL=cron.service.js.map