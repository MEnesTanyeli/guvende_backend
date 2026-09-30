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
exports.SafeZonesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const subscription_entitlement_service_1 = require("../common/subscription-entitlement.service");
let SafeZonesService = class SafeZonesService {
    prisma;
    subscriptionEntitlement;
    constructor(prisma, subscriptionEntitlement) {
        this.prisma = prisma;
        this.subscriptionEntitlement = subscriptionEntitlement;
    }
    async create(userId, familyId, dto) {
        await this.subscriptionEntitlement.assertFamilyEntitled(familyId);
        const membership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId,
                    userId,
                },
            },
        });
        if (!membership) {
            throw new common_1.ForbiddenException('Bu aile grubuna erişim yetkiniz yok.');
        }
        if (membership.memberType !== client_1.MemberType.guardian) {
            throw new common_1.ForbiddenException('Güvenli bölge eklemek için koruyucu (guardian) olmalısınız.');
        }
        return this.prisma.safeZone.create({
            data: {
                familyId,
                name: dto.name,
                latitude: dto.latitude,
                longitude: dto.longitude,
                radius: dto.radius,
                createdBy: userId,
            },
        });
    }
    async findAll(userId, familyId) {
        await this.subscriptionEntitlement.assertFamilyEntitled(familyId);
        const membership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId,
                    userId,
                },
            },
        });
        if (!membership) {
            throw new common_1.ForbiddenException('Bu aile grubuna erişim yetkiniz yok.');
        }
        if (membership.memberType !== client_1.MemberType.guardian) {
            throw new common_1.ForbiddenException('Guvenli bolgeleri sadece koruyucu (guardian) uyeler goruntuleyebilir.');
        }
        return this.prisma.safeZone.findMany({
            where: {
                familyId,
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }
    async remove(userId, safeZoneId) {
        const safeZone = await this.prisma.safeZone.findUnique({
            where: { id: safeZoneId },
        });
        if (!safeZone) {
            throw new common_1.NotFoundException('Güvenli bölge bulunamadı.');
        }
        await this.subscriptionEntitlement.assertFamilyEntitled(safeZone.familyId);
        const membership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId: safeZone.familyId,
                    userId,
                },
            },
        });
        if (!membership || membership.memberType !== client_1.MemberType.guardian) {
            throw new common_1.ForbiddenException('Bu güvenli bölgeyi silmek için yetkiniz yok.');
        }
        await this.prisma.safeZone.delete({
            where: { id: safeZoneId },
        });
        return { message: 'Güvenli bölge başarıyla silindi.' };
    }
};
exports.SafeZonesService = SafeZonesService;
exports.SafeZonesService = SafeZonesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        subscription_entitlement_service_1.SubscriptionEntitlementService])
], SafeZonesService);
//# sourceMappingURL=safe-zones.service.js.map