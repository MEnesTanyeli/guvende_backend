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
exports.AlertsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const subscription_entitlement_service_1 = require("../common/subscription-entitlement.service");
let AlertsService = class AlertsService {
    prisma;
    subscriptionEntitlement;
    constructor(prisma, subscriptionEntitlement) {
        this.prisma = prisma;
        this.subscriptionEntitlement = subscriptionEntitlement;
    }
    async findAll(userId, familyId) {
        const membership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId,
                    userId,
                },
            },
        });
        if (!membership) {
            throw new common_1.ForbiddenException('Bu aile grubunun alarmlarını görüntüleme yetkiniz yok.');
        }
        if (membership.memberType !== client_1.MemberType.guardian) {
            throw new common_1.ForbiddenException('Sadece veliler/koruyucular (guardian) alarmları görüntüleyebilir.');
        }
        await this.subscriptionEntitlement.assertFamilyEntitled(familyId);
        return this.prisma.alert.findMany({
            where: {
                familyId,
                family: {
                    members: {
                        some: { userId, memberType: client_1.MemberType.guardian },
                    },
                },
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }
    async resolve(userId, alertId) {
        const guardianFamilyScope = {
            members: {
                some: { userId, memberType: client_1.MemberType.guardian },
            },
        };
        const alert = await this.prisma.alert.findFirst({
            where: {
                id: alertId,
                family: { is: guardianFamilyScope },
            },
        });
        if (!alert) {
            throw new common_1.NotFoundException('Alarm bulunamadı.');
        }
        await this.subscriptionEntitlement.assertFamilyEntitled(alert.familyId);
        try {
            return await this.prisma.alert.update({
                where: {
                    id: alertId,
                    family: { is: guardianFamilyScope },
                },
                data: {
                    status: client_1.AlertStatus.resolved,
                    resolvedAt: new Date(),
                },
            });
        }
        catch (error) {
            if (error instanceof client_1.Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2025') {
                throw new common_1.NotFoundException('Alarm bulunamadı.');
            }
            throw error;
        }
    }
    async resolveAll(userId, familyId) {
        const membership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId,
                    userId,
                },
            },
        });
        if (!membership) {
            throw new common_1.ForbiddenException('Bu aile grubunun alarmlarını çözmeye yetkiniz yok.');
        }
        if (membership.memberType !== client_1.MemberType.guardian) {
            throw new common_1.ForbiddenException('Sadece veliler/koruyucular (guardian) alarmları çözebilir.');
        }
        await this.subscriptionEntitlement.assertFamilyEntitled(familyId);
        return this.prisma.alert.updateMany({
            where: {
                familyId,
                status: client_1.AlertStatus.active,
                family: {
                    members: {
                        some: { userId, memberType: client_1.MemberType.guardian },
                    },
                },
            },
            data: {
                status: client_1.AlertStatus.resolved,
                resolvedAt: new Date(),
            },
        });
    }
};
exports.AlertsService = AlertsService;
exports.AlertsService = AlertsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        subscription_entitlement_service_1.SubscriptionEntitlementService])
], AlertsService);
//# sourceMappingURL=alerts.service.js.map