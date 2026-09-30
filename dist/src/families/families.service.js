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
exports.FamiliesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const notifications_service_1 = require("../notifications/notifications.service");
const locations_gateway_1 = require("../locations/locations.gateway");
const crypto_1 = require("crypto");
const offline_sos_service_1 = require("../offline-sos/offline-sos.service");
const subscription_entitlement_service_1 = require("../common/subscription-entitlement.service");
const INVITE_CODE_WRITE_MAX_RETRIES = 3;
let FamiliesService = class FamiliesService {
    prisma;
    notificationsService;
    locationsGateway;
    offlineSosService;
    subscriptionEntitlement;
    inviteCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    constructor(prisma, notificationsService, locationsGateway, offlineSosService, subscriptionEntitlement) {
        this.prisma = prisma;
        this.notificationsService = notificationsService;
        this.locationsGateway = locationsGateway;
        this.offlineSosService = offlineSosService;
        this.subscriptionEntitlement = subscriptionEntitlement;
    }
    createInviteCode(length = 8) {
        let code = '';
        for (let i = 0; i < length; i += 1) {
            code +=
                this.inviteCodeAlphabet[(0, crypto_1.randomInt)(this.inviteCodeAlphabet.length)];
        }
        return code;
    }
    createSosEncryptionKey() {
        return (0, crypto_1.randomBytes)(32).toString('base64url');
    }
    async lockUserMembership(tx, userId) {
        await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`family-membership-user:${userId}`}, 0))`;
    }
    async lockFamilyMembership(tx, familyId) {
        await tx.$executeRaw `SELECT pg_advisory_xact_lock(hashtextextended(${`family-membership-family:${familyId}`}, 0))`;
    }
    async dissolveOwnedFamily(userId, familyId) {
        const memberUserIds = await this.prisma.$transaction(async (tx) => {
            await this.lockFamilyMembership(tx, familyId);
            const family = await tx.family.findUnique({
                where: { id: familyId },
                select: {
                    ownerId: true,
                    members: { select: { userId: true } },
                },
            });
            if (!family) {
                throw new common_1.NotFoundException('Aile grubu bulunamadı.');
            }
            if (family.ownerId !== userId) {
                throw new common_1.ForbiddenException('Sadece aile sahibi grubu silebilir/dağıtabilir.');
            }
            await tx.family.delete({ where: { id: familyId } });
            return family.members.map((member) => member.userId);
        });
        await Promise.all(memberUserIds.map((memberUserId) => this.locationsGateway.revokeFamilyAccess(memberUserId, familyId)));
    }
    async generateUniqueInviteCode(tx) {
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const inviteCode = this.createInviteCode();
            const existingFamily = await tx.family.findUnique({
                where: { inviteCode },
                select: { id: true },
            });
            if (!existingFamily) {
                return inviteCode;
            }
        }
        throw new common_1.ConflictException('Aile davet kodu olusturulamadi. Lutfen tekrar deneyin.');
    }
    isInviteCodeUniqueCollision(error) {
        if (!(error instanceof client_1.Prisma.PrismaClientKnownRequestError)) {
            return false;
        }
        if (error.code !== 'P2002') {
            return false;
        }
        const target = error.meta?.target;
        if (Array.isArray(target)) {
            return target.includes('inviteCode');
        }
        return typeof target === 'string' && target.includes('inviteCode');
    }
    async retryInviteCodeWrite(write) {
        let lastInviteCodeCollision;
        for (let attempt = 0; attempt <= INVITE_CODE_WRITE_MAX_RETRIES; attempt += 1) {
            try {
                return await write();
            }
            catch (error) {
                if (!this.isInviteCodeUniqueCollision(error)) {
                    throw error;
                }
                lastInviteCodeCollision = error;
            }
        }
        throw lastInviteCodeCollision;
    }
    async create(userId, dto) {
        await this.subscriptionEntitlement.assertUserEntitled(userId);
        return this.retryInviteCodeWrite(() => this.prisma.$transaction(async (tx) => {
            await this.lockUserMembership(tx, userId);
            const user = await tx.user.findUnique({
                where: { id: userId },
                select: {
                    role: true,
                    proxyId: true,
                    proxy: { select: { role: true } },
                },
            });
            const isGuardian = user?.role === client_1.MemberType.guardian;
            if (!isGuardian) {
                throw new common_1.ForbiddenException('Sadece veli hesapları yeni aile grubu oluşturabilir.');
            }
            const duplicateName = await tx.family.findFirst({
                where: {
                    ownerId: userId,
                    name: {
                        equals: dto.name,
                        mode: 'insensitive',
                    },
                },
            });
            if (duplicateName) {
                throw new common_1.ConflictException('Aynı isimde birden fazla aile grubu oluşturamazsınız.');
            }
            const totalMemberships = await tx.familyMember.count({
                where: { userId },
            });
            if (totalMemberships >= 2) {
                throw new common_1.ForbiddenException('En fazla 2 aile grubunda yer alabilirsiniz.');
            }
            const inviteCode = await this.generateUniqueInviteCode(tx);
            const family = await tx.family.create({
                data: {
                    inviteCode,
                    sosEncryptionKey: this.createSosEncryptionKey(),
                    name: dto.name,
                    type: dto.type || 'general',
                    ownerId: userId,
                },
            });
            await tx.familyMember.create({
                data: {
                    familyId: family.id,
                    userId: userId,
                    memberType: client_1.MemberType.guardian,
                    permissions: ['owner', 'all'],
                },
            });
            await this.offlineSosService.createInitialKey(tx, family.id);
            if (user.proxyId) {
                if (!user.proxy || user.proxy.role !== client_1.MemberType.guardian) {
                    throw new common_1.ForbiddenException('Vekil kullanıcının guardian olması gerekir.');
                }
                await tx.familyMember.create({
                    data: {
                        familyId: family.id,
                        userId: user.proxyId,
                        memberType: client_1.MemberType.guardian,
                        permissions: ['all', 'proxy'],
                    },
                });
            }
            return {
                id: family.id,
                name: family.name,
                type: family.type,
                ownerId: family.ownerId,
                createdAt: family.createdAt,
                updatedAt: family.updatedAt,
                inviteCode: family.inviteCode,
            };
        }));
    }
    async findAll(userId) {
        const families = await this.prisma.family.findMany({
            where: {
                members: {
                    some: {
                        userId: userId,
                    },
                },
            },
            select: {
                id: true,
                name: true,
                type: true,
                ownerId: true,
                createdAt: true,
                updatedAt: true,
                inviteCode: true,
                owner: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                members: {
                    where: {
                        userId: userId,
                    },
                    select: {
                        muteNotifications: true,
                        memberType: true,
                        guardianTrackingEnabled: true,
                    },
                },
                _count: {
                    select: { members: true },
                },
            },
        });
        return families.map((family) => {
            if (family.ownerId === userId)
                return family;
            const { inviteCode: _inviteCode, ...safeFamily } = family;
            return safeFamily;
        });
    }
    offlineSosProvisioning(userId, sessionId, familyId, deviceWrappingPublicKey) {
        return this.offlineSosService.provision(userId, sessionId, familyId, deviceWrappingPublicKey);
    }
    async findOne(userId, familyId) {
        const isMember = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId,
                    userId,
                },
            },
        });
        if (!isMember) {
            throw new common_1.ForbiddenException('Bu aile grubunun verilerine erişim izniniz yok.');
        }
        const requesterIsGuardian = isMember.memberType === client_1.MemberType.guardian;
        const family = await this.prisma.family.findUnique({
            where: { id: familyId },
            select: {
                id: true,
                name: true,
                type: true,
                ownerId: true,
                createdAt: true,
                updatedAt: true,
                inviteCode: true,
                owner: {
                    select: {
                        id: true,
                        name: true,
                    },
                },
                members: {
                    select: {
                        id: true,
                        userId: true,
                        memberType: true,
                        muteNotifications: true,
                        guardianTrackingEnabled: true,
                        user: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
                ...(requesterIsGuardian ? { safeZones: true } : {}),
            },
        });
        if (!family) {
            throw new common_1.NotFoundException('Aile grubu bulunamadı.');
        }
        const familyWithKey = await this.prisma.family.findUnique({
            where: { id: family.id },
            select: { sosEncryptionKey: true },
        });
        if (!familyWithKey?.sosEncryptionKey) {
            const sosEncryptionKey = this.createSosEncryptionKey();
            await this.prisma.family.update({
                where: { id: family.id },
                data: { sosEncryptionKey },
            });
        }
        const members = family.members.map((member) => {
            const isSelf = member.userId === userId;
            const visibleGuardianTracking = requesterIsGuardian && member.memberType === client_1.MemberType.guardian;
            return {
                id: member.id,
                userId: member.userId,
                memberType: member.memberType,
                user: member.user,
                ...(isSelf ? { muteNotifications: member.muteNotifications } : {}),
                ...(isSelf || visibleGuardianTracking
                    ? { guardianTrackingEnabled: member.guardianTrackingEnabled }
                    : {}),
            };
        });
        const safeFamily = { ...family, members };
        if (family.ownerId === userId)
            return safeFamily;
        const { inviteCode: _inviteCode, ...nonOwnerFamily } = safeFamily;
        return nonOwnerFamily;
    }
    async invite(userId, familyId) {
        const ownerFamily = await this.prisma.family.findUnique({
            where: { id: familyId },
            select: { ownerId: true },
        });
        if (!ownerFamily) {
            throw new common_1.NotFoundException('Aile grubu bulunamadi.');
        }
        if (ownerFamily.ownerId !== userId) {
            throw new common_1.ForbiddenException('Yalnizca aile sahibi davet kodu olusturabilir.');
        }
        const membership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId,
                    userId,
                },
            },
        });
        if (!membership) {
            throw new common_1.ForbiddenException('Bu aile grubuna erişim izniniz yok.');
        }
        if (membership.memberType !== client_1.MemberType.guardian) {
            throw new common_1.ForbiddenException('Sadece koruyucu (guardian) üyeler davet kodu oluşturabilir.');
        }
        const family = await this.prisma.family.findUnique({
            where: { id: familyId },
            select: { inviteCode: true },
        });
        if (!family) {
            throw new common_1.NotFoundException('Aile grubu bulunamadi.');
        }
        let inviteCode = family.inviteCode;
        if (!inviteCode) {
            inviteCode = await this.retryInviteCodeWrite(async () => {
                const nextInviteCode = await this.generateUniqueInviteCode(this.prisma);
                const updatedFamily = await this.prisma.family.update({
                    where: { id: familyId },
                    data: { inviteCode: nextInviteCode },
                    select: { inviteCode: true },
                });
                return updatedFamily.inviteCode;
            });
        }
        return {
            familyId,
            inviteCode,
            message: 'Bu kodu diger uyelerle paylasarak aileye katilmalarini saglayabilirsiniz.',
        };
    }
    async rotateInviteCode(userId, familyId) {
        return this.retryInviteCodeWrite(() => this.prisma.$transaction(async (tx) => {
            await this.lockFamilyMembership(tx, familyId);
            const family = await tx.family.findUnique({
                where: { id: familyId },
                select: { ownerId: true },
            });
            if (!family) {
                throw new common_1.NotFoundException('Aile grubu bulunamadi.');
            }
            if (family.ownerId !== userId) {
                throw new common_1.ForbiddenException('Yalnizca aile sahibi davet kodunu yenileyebilir.');
            }
            const inviteCode = await this.generateUniqueInviteCode(tx);
            await tx.family.update({
                where: { id: familyId },
                data: { inviteCode },
            });
            return { inviteCode };
        }));
    }
    async join(userId, dto) {
        const inviteCode = dto.inviteCode.trim().toUpperCase();
        return this.prisma.$transaction(async (tx) => {
            const initialFamily = await tx.family.findUnique({
                where: { inviteCode },
                select: { id: true },
            });
            if (!initialFamily) {
                throw new common_1.NotFoundException('Geçersiz aile davet kodu.');
            }
            await this.lockUserMembership(tx, userId);
            await this.lockFamilyMembership(tx, initialFamily.id);
            const family = await tx.family.findUnique({
                where: { inviteCode },
                select: { id: true },
            });
            if (!family || family.id !== initialFamily.id) {
                throw new common_1.NotFoundException('Geçersiz aile davet kodu.');
            }
            const joiningUser = await tx.user.findUnique({
                where: { id: userId },
                select: { role: true },
            });
            if (!joiningUser) {
                throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
            }
            if (!Object.values(client_1.MemberType).includes(joiningUser.role)) {
                throw new common_1.ForbiddenException('Kullanıcı profil tipi aile üyeliği için uygun değil.');
            }
            const currentMembershipsCount = await tx.familyMember.count({
                where: { userId },
            });
            const isGuardian = joiningUser.role !== 'child' && joiningUser.role !== 'elder';
            if (isGuardian) {
                if (currentMembershipsCount >= 2) {
                    throw new common_1.ForbiddenException('Veliler en fazla 2 aile grubunda yer alabilir.');
                }
            }
            else if (currentMembershipsCount >= 1) {
                throw new common_1.ForbiddenException('Çocuklar veya aile büyükleri sadece 1 aile grubunda yer alabilir.');
            }
            const existingMember = await tx.familyMember.findUnique({
                where: {
                    familyId_userId: {
                        familyId: family.id,
                        userId,
                    },
                },
            });
            if (existingMember) {
                throw new common_1.ConflictException('Zaten bu aile grubunun bir üyesisiniz.');
            }
            const memberTypeToUse = joiningUser.role;
            if (memberTypeToUse === client_1.MemberType.guardian) {
                const guardianCount = await tx.familyMember.count({
                    where: {
                        familyId: family.id,
                        memberType: client_1.MemberType.guardian,
                    },
                });
                if (guardianCount >= 2) {
                    throw new common_1.ForbiddenException('Bu aile grubunda zaten maksimum veli (2) sınırına ulaşılmış.');
                }
            }
            return tx.familyMember.create({
                data: {
                    familyId: family.id,
                    userId,
                    memberType: memberTypeToUse,
                    permissions: [],
                },
                include: {
                    family: {
                        select: {
                            name: true,
                        },
                    },
                },
            });
        });
    }
    async leave(userId, familyId) {
        const membership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: { familyId, userId },
            },
            include: { user: true },
        });
        if (!membership) {
            throw new common_1.NotFoundException('Bu aile grubunun üyesi değilsiniz.');
        }
        const family = await this.prisma.family.findUnique({
            where: { id: familyId },
            include: { members: true },
        });
        if (!family) {
            throw new common_1.NotFoundException('Aile grubu bulunamadı.');
        }
        if (family.ownerId === userId) {
            return this.deleteFamily(userId, familyId);
        }
        if (membership.memberType === client_1.MemberType.guardian) {
            const guardians = family.members.filter((m) => m.memberType === client_1.MemberType.guardian);
            if (guardians.length === 1) {
                return this.deleteFamily(userId, familyId);
            }
        }
        if (membership.memberType === client_1.MemberType.child ||
            membership.memberType === client_1.MemberType.elder) {
            const alertTitle = 'UYARI: GRUPTAN AYRILMA';
            const alertMsg = `${membership.user.name} aile grubundan kendi istegiyle ayrildi ve konum takibi sonlandirildi!`;
            await this.notificationsService.raiseFamilyAlert({
                familyId,
                userId,
                type: client_1.AlertType.family_leave,
                title: alertTitle,
                message: alertMsg,
                notificationData: { type: 'family_leave', userId },
            });
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.geofenceState.deleteMany({
                where: { userId, safeZone: { familyId } },
            });
            await tx.familyMember.delete({
                where: { familyId_userId: { familyId, userId } },
            });
            if (membership.memberType === client_1.MemberType.guardian) {
                await tx.guardianTrackingInterval.updateMany({
                    where: { familyId, guardianUserId: userId, endedAt: null },
                    data: { endedAt: new Date() },
                });
                await this.offlineSosService.rotateKey(tx, familyId);
            }
        });
        await this.locationsGateway.revokeFamilyAccess(userId, familyId);
        return {
            success: true,
            message: 'Aile grubundan başarıyla ayrıldınız.',
        };
    }
    async removeMember(userId, familyId, targetUserId) {
        const family = await this.prisma.family.findUnique({
            where: { id: familyId },
            select: { ownerId: true, owner: { select: { proxyId: true } } },
        });
        if (!family) {
            throw new common_1.NotFoundException('Aile grubu bulunamadı.');
        }
        if (family.ownerId !== userId) {
            throw new common_1.ForbiddenException('Sadece aile sahibi gruptan üye çıkarabilir.');
        }
        const targetMembership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: { familyId, userId: targetUserId },
            },
            include: { user: true },
        });
        if (!targetMembership) {
            throw new common_1.NotFoundException('Çıkarılmak istenen üye bu aile grubunda bulunamadı.');
        }
        if (family.ownerId === targetUserId) {
            throw new common_1.ForbiddenException('Grup kurucusu/sahibi gruptan çıkarılamaz.');
        }
        if (userId === targetUserId) {
            throw new common_1.ForbiddenException('Kendinizi gruptan çıkaramazsınız. Gruptan ayrılmak için "Ayrıl" özelliğini kullanın.');
        }
        if (family.owner.proxyId === targetUserId) {
            throw new common_1.ConflictException('Mevcut vekil normal üye çıkarma işlemiyle kaldırılamaz. Vekalet işlemlerindeki "Vekili Kaldır" seçeneğini kullanın.');
        }
        if (targetMembership.memberType === client_1.MemberType.child ||
            targetMembership.memberType === client_1.MemberType.elder) {
            const alertTitle = 'UYARI: GRUPTAN ÇIKARILDI';
            const alertMsg = `${targetMembership.user.name}, veli tarafından aile grubundan çıkarıldı ve konum takibi sonlandırıldı!`;
            await this.notificationsService.raiseFamilyAlert({
                familyId,
                userId: targetUserId,
                type: client_1.AlertType.family_leave,
                title: alertTitle,
                message: alertMsg,
                notificationData: { type: 'family_leave', userId: targetUserId },
            });
        }
        await this.prisma.$transaction(async (tx) => {
            await tx.geofenceState.deleteMany({
                where: { userId: targetUserId, safeZone: { familyId } },
            });
            await tx.familyMember.delete({
                where: { familyId_userId: { familyId, userId: targetUserId } },
            });
            if (targetMembership.memberType === client_1.MemberType.guardian) {
                await tx.guardianTrackingInterval.updateMany({
                    where: {
                        familyId,
                        guardianUserId: targetUserId,
                        endedAt: null,
                    },
                    data: { endedAt: new Date() },
                });
                await this.offlineSosService.rotateKey(tx, familyId);
            }
        });
        await this.locationsGateway.revokeFamilyAccess(targetUserId, familyId);
        return {
            success: true,
            message: 'Üye aile grubundan başarıyla çıkarıldı.',
        };
    }
    async deleteFamily(userId, familyId) {
        await this.dissolveOwnedFamily(userId, familyId);
        return {
            success: true,
            message: 'Aile grubu başarıyla silindi ve dağıtıldı.',
        };
    }
    async muteNotifications(userId, familyId, mute) {
        const membership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId,
                    userId,
                },
            },
        });
        if (!membership) {
            throw new common_1.NotFoundException('Bu aile grubunun üyesi değilsiniz.');
        }
        return this.prisma.familyMember.update({
            where: {
                familyId_userId: {
                    familyId,
                    userId,
                },
            },
            data: {
                muteNotifications: mute,
            },
        });
    }
    async updateOwnTracking(userId, familyId, enabled) {
        if (enabled) {
            await this.subscriptionEntitlement.assertFamilyEntitled(familyId);
        }
        return this.prisma.$transaction(async (tx) => {
            const lockedMemberships = await tx.$queryRaw(client_1.Prisma.sql `
          SELECT "id"
          FROM "family_members"
          WHERE "familyId" = ${familyId} AND "userId" = ${userId}
          FOR UPDATE
        `);
            if (lockedMemberships.length === 0) {
                throw new common_1.NotFoundException('Bu aile grubunun uyesi degilsiniz.');
            }
            const membership = await tx.familyMember.findUnique({
                where: { familyId_userId: { familyId, userId } },
            });
            if (!membership) {
                throw new common_1.NotFoundException('Bu aile grubunun uyesi degilsiniz.');
            }
            if (membership.memberType !== client_1.MemberType.guardian) {
                throw new common_1.ForbiddenException('Cocuk ve yasli uyelerde takip ayari kapatilamaz.');
            }
            if (membership.guardianTrackingEnabled === enabled) {
                return membership;
            }
            const changedAt = new Date();
            const updatedMembership = await tx.familyMember.update({
                where: { familyId_userId: { familyId, userId } },
                data: { guardianTrackingEnabled: enabled },
            });
            if (enabled) {
                await tx.guardianTrackingInterval.create({
                    data: {
                        familyId,
                        guardianUserId: userId,
                        startedAt: changedAt,
                    },
                });
            }
            else {
                await tx.guardianTrackingInterval.updateMany({
                    where: { familyId, guardianUserId: userId, endedAt: null },
                    data: { endedAt: changedAt },
                });
            }
            return updatedMembership;
        });
    }
};
exports.FamiliesService = FamiliesService;
exports.FamiliesService = FamiliesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notifications_service_1.NotificationsService,
        locations_gateway_1.LocationsGateway,
        offline_sos_service_1.OfflineSosService,
        subscription_entitlement_service_1.SubscriptionEntitlementService])
], FamiliesService);
//# sourceMappingURL=families.service.js.map