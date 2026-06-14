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
exports.MedicationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const users_service_1 = require("../users/users.service");
const client_1 = require("@prisma/client");
const locations_gateway_1 = require("../locations/locations.gateway");
let MedicationsService = class MedicationsService {
    prisma;
    usersService;
    locationsGateway;
    constructor(prisma, usersService, locationsGateway) {
        this.prisma = prisma;
        this.usersService = usersService;
        this.locationsGateway = locationsGateway;
    }
    async createReminder(creatorId, dto) {
        const creatorProfile = await this.usersService.findOne(creatorId);
        if (!creatorProfile.isPremium) {
            throw new common_1.ForbiddenException('İlaç Takibi özelliği sadece Premium üyeler içindir.');
        }
        const targetUser = await this.prisma.user.findUnique({
            where: { id: dto.userId },
        });
        if (!targetUser) {
            throw new common_1.NotFoundException('İlaç atanacak üye bulunamadı.');
        }
        if (targetUser.role !== 'elder' && targetUser.role !== 'child') {
            throw new common_1.ForbiddenException('İlaç hatırlatıcıları sadece çocuklar veya aile büyükleri için tanımlanabilir.');
        }
        const commonFamily = await this.prisma.familyMember.findFirst({
            where: {
                userId: dto.userId,
                family: {
                    members: {
                        some: {
                            userId: creatorId,
                            memberType: client_1.MemberType.guardian,
                        },
                    },
                },
            },
        });
        if (!commonFamily) {
            throw new common_1.ForbiddenException('Bu üyeye ilaç hatırlatıcısı ekleme yetkiniz yok.');
        }
        return this.prisma.medicationReminder.create({
            data: {
                userId: dto.userId,
                medicationName: dto.medicationName,
                dosage: dto.dosage,
                time: dto.time,
                reminderType: dto.reminderType || 'medication',
                startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
                repeatDays: dto.repeatDays ? Number(dto.repeatDays) : null,
            },
        });
    }
    async getReminders(userId) {
        return this.prisma.medicationReminder.findMany({
            where: {
                userId,
                isActive: true,
            },
            orderBy: {
                time: 'asc',
            },
        });
    }
    async deleteReminder(reminderId, deleterId) {
        const reminder = await this.prisma.medicationReminder.findUnique({
            where: { id: reminderId },
        });
        if (!reminder) {
            throw new common_1.NotFoundException('İlaç hatırlatıcısı bulunamadı.');
        }
        const commonFamily = await this.prisma.familyMember.findFirst({
            where: {
                userId: reminder.userId,
                family: {
                    members: {
                        some: {
                            userId: deleterId,
                            memberType: client_1.MemberType.guardian,
                        },
                    },
                },
            },
        });
        if (!commonFamily) {
            throw new common_1.ForbiddenException('Bu ilaç hatırlatıcısını silme yetkiniz yok.');
        }
        return this.prisma.medicationReminder.delete({
            where: { id: reminderId },
        });
    }
    async takeMedication(reminderId, userId) {
        const reminder = await this.prisma.medicationReminder.findUnique({
            where: { id: reminderId },
            include: {
                user: true,
            },
        });
        if (!reminder) {
            throw new common_1.NotFoundException('İlaç hatırlatıcısı bulunamadı.');
        }
        if (reminder.userId !== userId) {
            throw new common_1.ForbiddenException('Bu ilaç size ait değil.');
        }
        const updated = await this.prisma.medicationReminder.update({
            where: { id: reminderId },
            data: {
                lastTakenAt: new Date(),
            },
        });
        const memberships = await this.prisma.familyMember.findMany({
            where: { userId },
        });
        let title = '💊 İlaç İçildi';
        let message = `${reminder.user.name} isimli üye "${reminder.medicationName}" ilacını içti.`;
        const rType = reminder.reminderType || 'medication';
        if (rType === 'appointment') {
            title = '📅 Randevuya Katılındı';
            message = `${reminder.user.name} isimli üye "${reminder.medicationName}" randevusunu onayladı.`;
        }
        else if (rType === 'water') {
            title = '🥤 Su İçildi';
            message = `${reminder.user.name} isimli üye "${reminder.medicationName}" su hatırlatıcısını onayladı.`;
        }
        else if (rType === 'checkin') {
            title = '🛡️ Kontrol Onaylandı';
            message = `${reminder.user.name} isimli üye "${reminder.medicationName}" kontrol uyarısını onayladı.`;
        }
        else if (rType === 'alarm') {
            title = '🚨 Alarm Onaylandı';
            message = `${reminder.user.name} isimli üye "${reminder.medicationName}" alarm uyarısını onayladı.`;
        }
        for (const membership of memberships) {
            const alert = await this.prisma.alert.create({
                data: {
                    familyId: membership.familyId,
                    userId: userId,
                    type: client_1.AlertType.medication_taken,
                    title,
                    message,
                    status: client_1.AlertStatus.active,
                    metadata: {
                        reminderId,
                        medicationName: reminder.medicationName,
                        dosage: reminder.dosage,
                        time: reminder.time,
                        reminderType: rType,
                    },
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
            this.locationsGateway.sendAlertNotification(membership.familyId, alert);
        }
        return updated;
    }
    async updateReminder(reminderId, updaterId, dto) {
        const reminder = await this.prisma.medicationReminder.findUnique({
            where: { id: reminderId },
        });
        if (!reminder) {
            throw new common_1.NotFoundException('Hatırlatıcı bulunamadı.');
        }
        const commonFamily = await this.prisma.familyMember.findFirst({
            where: {
                userId: reminder.userId,
                family: {
                    members: {
                        some: {
                            userId: updaterId,
                            memberType: client_1.MemberType.guardian,
                        },
                    },
                },
            },
        });
        if (!commonFamily) {
            throw new common_1.ForbiddenException('Bu hatırlatıcıyı düzenleme yetkiniz yok.');
        }
        return this.prisma.medicationReminder.update({
            where: { id: reminderId },
            data: {
                medicationName: dto.medicationName,
                dosage: dto.dosage,
                time: dto.time,
                reminderType: dto.reminderType,
                startDate: dto.startDate ? new Date(dto.startDate) : undefined,
                repeatDays: dto.repeatDays !== undefined ? (dto.repeatDays ? Number(dto.repeatDays) : null) : undefined,
            },
        });
    }
};
exports.MedicationsService = MedicationsService;
exports.MedicationsService = MedicationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        users_service_1.UsersService,
        locations_gateway_1.LocationsGateway])
], MedicationsService);
//# sourceMappingURL=medications.service.js.map