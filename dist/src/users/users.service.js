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
exports.UsersService = void 0;
const bcrypt = __importStar(require("bcrypt"));
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const locations_gateway_1 = require("../locations/locations.gateway");
const offline_sos_service_1 = require("../offline-sos/offline-sos.service");
let UsersService = class UsersService {
    prisma;
    locationsGateway;
    offlineSosService;
    constructor(prisma, locationsGateway, offlineSosService) {
        this.prisma = prisma;
        this.locationsGateway = locationsGateway;
        this.offlineSosService = offlineSosService;
    }
    async lockProxyMutation(tx, ownerUserId) {
        await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`proxy-mutation:${ownerUserId}`}, 0))`;
    }
    async accountDeletionInfo(userId) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                isPremium: true,
                premiumExpiresAt: true,
                trialEndsAt: true,
                _count: { select: { familiesOwned: true } },
            },
        });
        if (!user)
            throw new common_1.UnauthorizedException();
        return {
            ownsFamilies: user._count.familiesOwned > 0,
            hasActiveEntitlement: user.trialEndsAt > new Date() ||
                !!(user.isPremium &&
                    user.premiumExpiresAt &&
                    user.premiumExpiresAt > new Date()),
        };
    }
    async deleteAccount(userId, password) {
        const familyIds = await this.prisma
            .$transaction(async (tx) => {
            await tx.$queryRaw `SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: { passwordHash: true },
            });
            if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
                throw new common_1.UnauthorizedException('Hesap veya sifre dogrulanamadi.');
            }
            const families = await tx.family.findMany({
                where: { ownerId: userId },
                select: { id: true },
            });
            await tx.user.delete({ where: { id: userId } });
            return families.map((family) => family.id);
        })
            .catch((error) => {
            if (this.hasPrismaCode(error, 'P2025'))
                throw new common_1.UnauthorizedException('Hesap artik mevcut degil.');
            throw error;
        });
        this.locationsGateway.disconnectUser(userId);
        for (const familyId of familyIds)
            this.locationsGateway.clearFamilyRoom(familyId);
        return { success: true };
    }
    async findOne(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: {
                familiesOwned: true,
                proxy: true,
                memberships: {
                    include: {
                        family: {
                            include: {
                                owner: true,
                            },
                        },
                    },
                },
            },
        });
        if (!user) {
            throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
        }
        const now = new Date();
        const userTrialActive = user.trialEndsAt > now;
        const userPremiumActive = user.isPremium && user.premiumExpiresAt && user.premiumExpiresAt > now;
        let isPremiumByAssociation = userTrialActive || userPremiumActive;
        let associatedPremiumExpiresAt = userPremiumActive
            ? user.premiumExpiresAt
            : null;
        let associatedTrialEndsAt = userTrialActive
            ? user.trialEndsAt
            : null;
        const proxyOwner = await this.prisma.user.findFirst({
            where: {
                proxyId: user.id,
            },
        });
        const isProxy = !!proxyOwner;
        if (!isPremiumByAssociation && proxyOwner) {
            const ownerTrialActive = proxyOwner.trialEndsAt > now;
            const ownerPremiumActive = proxyOwner.isPremium &&
                proxyOwner.premiumExpiresAt &&
                proxyOwner.premiumExpiresAt > now;
            if (ownerTrialActive || ownerPremiumActive) {
                isPremiumByAssociation = true;
                associatedPremiumExpiresAt = proxyOwner.premiumExpiresAt;
                associatedTrialEndsAt = proxyOwner.trialEndsAt;
            }
        }
        if (!isPremiumByAssociation) {
            for (const membership of user.memberships) {
                const owner = membership.family.owner;
                const ownerTrialActive = owner.trialEndsAt > now;
                const ownerPremiumActive = owner.isPremium &&
                    owner.premiumExpiresAt &&
                    owner.premiumExpiresAt > now;
                if (ownerTrialActive || ownerPremiumActive) {
                    isPremiumByAssociation = true;
                    associatedPremiumExpiresAt = owner.premiumExpiresAt;
                    associatedTrialEndsAt = owner.trialEndsAt;
                    break;
                }
            }
        }
        const isGuardian = user.role !== 'child' && user.role !== 'elder';
        const isInFamily = user.memberships.length > 0;
        return {
            id: user.id,
            email: user.email,
            name: user.name,
            phone: user.phone,
            role: user.role,
            gender: user.gender,
            trialEndsAt: associatedTrialEndsAt || user.trialEndsAt,
            isPremium: isPremiumByAssociation,
            premiumExpiresAt: associatedPremiumExpiresAt || user.premiumExpiresAt,
            isGuardian,
            isInFamily,
            isProxy,
            proxy: user.proxy
                ? { id: user.proxy.id, email: user.proxy.email, name: user.proxy.name }
                : null,
            isLocked: user.isLocked,
            devicePermissions: user.devicePermissions,
            createdAt: user.createdAt,
        };
    }
    async updateProfile(id, name, phone, gender) {
        await this.prisma.user.update({
            where: { id },
            data: {
                ...(name && { name }),
                ...(phone && { phone }),
                ...(gender && { gender }),
            },
        });
        return this.findOne(id);
    }
    async setProxy(userId, email) {
        try {
            await this.prisma.$transaction(async (tx) => {
                await this.lockProxyMutation(tx, userId);
                const requester = await tx.user.findUnique({
                    where: { id: userId },
                    select: { id: true, role: true, proxyId: true },
                });
                if (!requester) {
                    throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
                }
                const target = await tx.user.findUnique({
                    where: { email: email.toLowerCase() },
                    select: { id: true, role: true, proxyId: true },
                });
                if (!target) {
                    throw new common_1.NotFoundException('Vekalet atanacak kullanıcı bulunamadı.');
                }
                if (requester.id === target.id) {
                    throw new common_1.ForbiddenException('Kendinizi vekil olarak atayamazsınız.');
                }
                if (requester.role !== client_1.MemberType.guardian ||
                    target.role !== client_1.MemberType.guardian) {
                    throw new common_1.ForbiddenException('Vekalet yalnızca guardian hesaplar arasında kurulabilir.');
                }
                if (requester.proxyId) {
                    throw new common_1.ForbiddenException('Mevcut vekalet ilişkisini önce kaldırmalısınız.');
                }
                if (target.proxyId) {
                    throw new common_1.ForbiddenException('Vekil hesabın zaten kendi vekaleti bulunuyor.');
                }
                const requesterOwner = await tx.user.findUnique({
                    where: { proxyId: requester.id },
                    select: { id: true },
                });
                if (requesterOwner) {
                    throw new common_1.ForbiddenException('Vekil olarak atanmış kullanıcı vekil seçemez.');
                }
                const targetOwner = await tx.user.findUnique({
                    where: { proxyId: target.id },
                    select: { id: true },
                });
                if (targetOwner) {
                    throw new common_1.ForbiddenException('Bu guardian zaten başka bir kullanıcının vekili.');
                }
                const ownerFamilies = await tx.family.findMany({
                    where: { ownerId: requester.id },
                    select: { id: true },
                });
                await tx.user.update({
                    where: { id: requester.id },
                    data: { proxyId: target.id },
                });
                for (const family of ownerFamilies) {
                    const existing = await tx.familyMember.findUnique({
                        where: {
                            familyId_userId: {
                                familyId: family.id,
                                userId: target.id,
                            },
                        },
                        select: { id: true },
                    });
                    if (!existing) {
                        await tx.familyMember.create({
                            data: {
                                familyId: family.id,
                                userId: target.id,
                                memberType: client_1.MemberType.guardian,
                                permissions: ['all', 'proxy'],
                            },
                        });
                    }
                }
            }, { isolationLevel: 'Serializable' });
        }
        catch (error) {
            if (this.hasPrismaCode(error, 'P2002') ||
                this.hasPrismaCode(error, 'P2034')) {
                throw new common_1.ConflictException('Vekalet ilişkisi eşzamanlı olarak değiştirildi. Lütfen tekrar deneyin.');
            }
            throw error;
        }
        return this.findOne(userId);
    }
    async removeProxy(userId) {
        const removal = await this.prisma.$transaction(async (tx) => {
            await this.lockProxyMutation(tx, userId);
            const currentUser = await tx.user.findUnique({
                where: { id: userId },
                select: { proxyId: true },
            });
            if (!currentUser) {
                throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
            }
            if (!currentUser.proxyId) {
                return { proxyId: null, revokedFamilyIds: [] };
            }
            const expectedProxyId = currentUser.proxyId;
            const revokedFamilyIds = [];
            const ownerFamilies = await tx.family.findMany({
                where: { ownerId: userId },
                select: { id: true },
            });
            for (const family of ownerFamilies) {
                const deleted = await tx.familyMember.deleteMany({
                    where: {
                        familyId: family.id,
                        userId: expectedProxyId,
                        permissions: { has: 'proxy' },
                    },
                });
                if (deleted.count > 0)
                    revokedFamilyIds.push(family.id);
                if (deleted.count > 0) {
                    await tx.guardianTrackingInterval.updateMany({
                        where: {
                            familyId: family.id,
                            guardianUserId: expectedProxyId,
                            endedAt: null,
                        },
                        data: { endedAt: new Date() },
                    });
                    await tx.geofenceState.deleteMany({
                        where: {
                            userId: expectedProxyId,
                            safeZone: { familyId: family.id },
                        },
                    });
                    await this.offlineSosService.rotateKey(tx, family.id);
                }
            }
            const cleared = await tx.user.updateMany({
                where: { id: userId, proxyId: expectedProxyId },
                data: { proxyId: null },
            });
            if (cleared.count !== 1) {
                throw new common_1.ConflictException('Vekalet ilişkisi eşzamanlı olarak değiştirildi. Lütfen tekrar deneyin.');
            }
            return { proxyId: expectedProxyId, revokedFamilyIds };
        });
        if (removal.proxyId) {
            await Promise.all(removal.revokedFamilyIds.map((familyId) => this.locationsGateway.revokeFamilyAccess(removal.proxyId, familyId)));
        }
        return this.findOne(userId);
    }
    async resetDevice(guardianId, childId) {
        await this.prisma.$transaction(async (tx) => {
            await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`session-security:${childId}`}, 0))`;
            const child = await tx.user.findUnique({
                where: { id: childId },
                select: { role: true },
            });
            if (!child)
                throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
            if (child.role !== client_1.MemberType.child && child.role !== client_1.MemberType.elder) {
                throw new common_1.ForbiddenException('Yalnız çocuk veya aile büyüğü hesaplarının cihazı sıfırlanabilir.');
            }
            const memberships = await tx.familyMember.findMany({
                where: {
                    userId: childId,
                    memberType: { in: [client_1.MemberType.child, client_1.MemberType.elder] },
                },
                take: 2,
                select: {
                    memberType: true,
                    family: { select: { ownerId: true } },
                },
            });
            if (memberships.length !== 1) {
                throw new common_1.ConflictException('Cihaz sıfırlama için tek ve doğrulanabilir bir aile belirlenemedi.');
            }
            if (memberships[0].memberType !== child.role ||
                memberships[0].family.ownerId !== guardianId) {
                throw new common_1.ForbiddenException('Cihazı yalnız ilgili ailenin sahibi sıfırlayabilir.');
            }
            await tx.session.updateMany({
                where: { userId: childId, revokedAt: null },
                data: { revokedAt: new Date() },
            });
            await tx.childElderLogoutApproval.deleteMany({
                where: { userId: childId },
            });
            await tx.user.update({
                where: { id: childId },
                data: {
                    deviceId: null,
                    loginAllowed: true,
                    deviceLoginBlocked: false,
                },
            });
        });
        this.locationsGateway.disconnectUser(childId);
        return {
            message: 'Eski cihaz oturumları kapatıldı ve cihaz kilidi kaldırıldı. Yeni cihazla giriş yapılabilir.',
        };
    }
    async updateDevicePermissions(userId, permissions) {
        await this.prisma.user.update({
            where: { id: userId },
            data: { devicePermissions: permissions },
        });
        return { success: true };
    }
    hasPrismaCode(error, code) {
        return (typeof error === 'object' &&
            error !== null &&
            'code' in error &&
            error.code === code);
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        locations_gateway_1.LocationsGateway,
        offline_sos_service_1.OfflineSosService])
], UsersService);
//# sourceMappingURL=users.service.js.map