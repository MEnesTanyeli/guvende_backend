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
let FamiliesService = class FamiliesService {
    prisma;
    notificationsService;
    inviteCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    constructor(prisma, notificationsService) {
        this.prisma = prisma;
        this.notificationsService = notificationsService;
    }
    createInviteCode(length = 8) {
        let code = '';
        for (let i = 0; i < length; i += 1) {
            code += this.inviteCodeAlphabet[Math.floor(Math.random() * this.inviteCodeAlphabet.length)];
        }
        return code;
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
    async create(userId, dto) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, proxyId: true },
        });
        const isGuardian = user && user.role !== 'child' && user.role !== 'elder';
        if (!isGuardian) {
            throw new common_1.ForbiddenException('Sadece veli hesaplarÄ± yeni aile grubu oluÅŸturabilir.');
        }
        const duplicateName = await this.prisma.family.findFirst({
            where: {
                ownerId: userId,
                name: {
                    equals: dto.name,
                    mode: 'insensitive',
                },
            },
        });
        if (duplicateName) {
            throw new common_1.ConflictException('AynÄ± isimde birden fazla aile grubu oluÅŸturamazsÄ±nÄ±z.');
        }
        const totalMemberships = await this.prisma.familyMember.count({
            where: { userId },
        });
        if (totalMemberships >= 2) {
            throw new common_1.ForbiddenException('En fazla 2 aile grubunda yer alabilirsiniz.');
        }
        return this.prisma.$transaction(async (tx) => {
            const inviteCode = await this.generateUniqueInviteCode(tx);
            const family = await tx.family.create({
                data: {
                    inviteCode,
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
            if (user.proxyId) {
                await tx.familyMember.create({
                    data: {
                        familyId: family.id,
                        userId: user.proxyId,
                        memberType: client_1.MemberType.guardian,
                        permissions: ['all'],
                    },
                });
            }
            return family;
        });
    }
    async findAll(userId) {
        return this.prisma.family.findMany({
            where: {
                members: {
                    some: {
                        userId: userId,
                    },
                },
            },
            include: {
                owner: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                members: {
                    where: {
                        userId: userId,
                    },
                    select: {
                        muteNotifications: true,
                        memberType: true,
                    },
                },
                _count: {
                    select: { members: true },
                },
            },
        });
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
            throw new common_1.ForbiddenException('Bu aile grubunun verilerine eriÅŸim izniniz yok.');
        }
        const family = await this.prisma.family.findUnique({
            where: { id: familyId },
            include: {
                owner: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                    },
                },
                members: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                name: true,
                                email: true,
                                phone: true,
                                gender: true,
                                isLocked: true,
                            },
                        },
                    },
                },
                safeZones: true,
            },
        });
        if (!family) {
            throw new common_1.NotFoundException('Aile grubu bulunamadÄ±.');
        }
        return family;
    }
    async invite(userId, familyId) {
        const membership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId,
                    userId,
                },
            },
        });
        if (!membership) {
            throw new common_1.ForbiddenException('Bu aile grubuna eriÅŸim izniniz yok.');
        }
        if (membership.memberType !== client_1.MemberType.guardian) {
            throw new common_1.ForbiddenException('Sadece koruyucu (guardian) Ã¼yeler davet kodu oluÅŸturabilir.');
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
            inviteCode = await this.generateUniqueInviteCode(this.prisma);
            await this.prisma.family.update({
                where: { id: familyId },
                data: { inviteCode },
            });
        }
        return {
            familyId,
            inviteCode,
            message: 'Bu kodu diger uyelerle paylasarak aileye katilmalarini saglayabilirsiniz.',
        };
    }
    async join(userId, dto) {
        const familyIdOrInviteCode = dto.familyId.trim();
        const inviteCode = familyIdOrInviteCode.toUpperCase();
        const family = await this.prisma.family.findFirst({
            where: {
                OR: [
                    { inviteCode },
                    { id: familyIdOrInviteCode },
                ],
            },
        });
        if (!family) {
            throw new common_1.NotFoundException('GeÃ§ersiz aile davet kodu.');
        }
        const joiningUser = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });
        if (!joiningUser) {
            throw new common_1.NotFoundException('KullanÄ±cÄ± bulunamadÄ±.');
        }
        const currentMembershipsCount = await this.prisma.familyMember.count({
            where: { userId },
        });
        const isGuardian = joiningUser.role !== 'child' && joiningUser.role !== 'elder';
        if (isGuardian) {
            if (currentMembershipsCount >= 2) {
                throw new common_1.ForbiddenException('Veliler en fazla 2 aile grubunda yer alabilir.');
            }
        }
        else {
            if (currentMembershipsCount >= 1) {
                throw new common_1.ForbiddenException('Ã‡ocuklar veya aile bÃ¼yÃ¼kleri sadece 1 aile grubunda yer alabilir.');
            }
        }
        const existingMember = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId: family.id,
                    userId,
                },
            },
        });
        if (existingMember) {
            throw new common_1.ConflictException('Zaten bu aile grubunun bir Ã¼yesisiniz.');
        }
        const memberTypeToUse = dto.memberType || joiningUser.role || client_1.MemberType.child;
        if (memberTypeToUse === client_1.MemberType.guardian) {
            const guardianCount = await this.prisma.familyMember.count({
                where: {
                    familyId: family.id,
                    memberType: client_1.MemberType.guardian,
                },
            });
            if (guardianCount >= 2) {
                throw new common_1.ForbiddenException('Bu aile grubunda zaten maksimum veli (2) sÄ±nÄ±rÄ±na ulaÅŸÄ±lmÄ±ÅŸ.');
            }
        }
        return this.prisma.familyMember.create({
            data: {
                familyId: family.id,
                userId: userId,
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
    }
    async updateMemberRole(userId, familyId, targetUserId, newRole) {
        const editorMembership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId,
                    userId,
                },
            },
        });
        if (!editorMembership) {
            throw new common_1.ForbiddenException('Bu aile grubuna Ã¼ye deÄŸilsiniz.');
        }
        if (editorMembership.memberType !== client_1.MemberType.guardian) {
            throw new common_1.ForbiddenException('Sadece koruyucu (guardian) Ã¼yeler baÅŸkalarÄ±nÄ±n rollerini deÄŸiÅŸtirebilir.');
        }
        const targetMembership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId,
                    userId: targetUserId,
                },
            },
        });
        if (!targetMembership) {
            throw new common_1.NotFoundException('GÃ¼ncellenmek istenen aile Ã¼yesi grupta bulunamadÄ±.');
        }
        const family = await this.prisma.family.findUnique({
            where: { id: familyId }
        });
        if (family && family.ownerId === targetUserId) {
            throw new common_1.ForbiddenException('Grup sahibinin rolÃ¼ deÄŸiÅŸtirilemez.');
        }
        if (!Object.values(client_1.MemberType).includes(newRole)) {
            throw new common_1.ConflictException('GeÃ§ersiz Ã¼ye tipi.');
        }
        if (newRole === client_1.MemberType.guardian && targetMembership.memberType !== client_1.MemberType.guardian) {
            const guardianCount = await this.prisma.familyMember.count({
                where: {
                    familyId: familyId,
                    memberType: client_1.MemberType.guardian,
                },
            });
            if (guardianCount >= 2) {
                throw new common_1.ForbiddenException('Bu aile grubunda zaten maksimum veli (2) sÄ±nÄ±rÄ±na ulaÅŸÄ±lmÄ±ÅŸ.');
            }
        }
        return this.prisma.familyMember.update({
            where: {
                familyId_userId: {
                    familyId,
                    userId: targetUserId,
                },
            },
            data: {
                memberType: newRole,
            },
            include: {
                user: {
                    select: {
                        id: true,
                        name: true,
                        email: true,
                        gender: true,
                    }
                }
            }
        });
    }
    async leave(userId, familyId) {
        const membership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: { familyId, userId }
            },
            include: { user: true }
        });
        if (!membership) {
            throw new common_1.NotFoundException('Bu aile grubunun Ã¼yesi deÄŸilsiniz.');
        }
        const family = await this.prisma.family.findUnique({
            where: { id: familyId },
            include: { members: true }
        });
        if (!family) {
            throw new common_1.NotFoundException('Aile grubu bulunamadÄ±.');
        }
        if (membership.memberType === client_1.MemberType.guardian) {
            const guardians = family.members.filter(m => m.memberType === client_1.MemberType.guardian);
            if (guardians.length === 1) {
                return this.deleteFamily(userId, familyId);
            }
        }
        if (membership.memberType === client_1.MemberType.child || membership.memberType === client_1.MemberType.elder) {
            const remainingGuardians = family.members.filter(m => m.memberType === client_1.MemberType.guardian && m.userId !== userId);
            const alertTitle = 'ğŸšª GRUPTAN AYRILMA';
            const alertMsg = `${membership.user.name} aile grubundan kendi isteÄŸiyle ayrÄ±ldÄ± ve konum takibi sonlandÄ±rÄ±ldÄ±!`;
            for (const guardian of remainingGuardians) {
                await this.prisma.alert.create({
                    data: {
                        familyId,
                        userId,
                        type: 'family_leave',
                        title: alertTitle,
                        message: alertMsg,
                        status: 'active'
                    }
                });
            }
            await this.notificationsService.sendFamilyNotification(familyId, userId, alertTitle, alertMsg, { type: 'family_leave', userId });
        }
        await this.prisma.familyMember.delete({
            where: {
                familyId_userId: { familyId, userId }
            }
        });
        return { success: true, message: 'Aile grubundan baÅŸarÄ±yla ayrÄ±ldÄ±nÄ±z.' };
    }
    async removeMember(userId, familyId, targetUserId) {
        const editorMembership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: { familyId, userId }
            }
        });
        if (!editorMembership || editorMembership.memberType !== client_1.MemberType.guardian) {
            throw new common_1.ForbiddenException('Sadece veli (guardian) rolÃ¼ndeki Ã¼yeler gruptan Ã¼ye Ã§Ä±karabilir.');
        }
        const targetMembership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: { familyId, userId: targetUserId }
            },
            include: { user: true }
        });
        if (!targetMembership) {
            throw new common_1.NotFoundException('Ã‡Ä±karÄ±lmak istenen Ã¼ye bu aile grubunda bulunamadÄ±.');
        }
        const family = await this.prisma.family.findUnique({
            where: { id: familyId }
        });
        if (!family) {
            throw new common_1.NotFoundException('Aile grubu bulunamadÄ±.');
        }
        if (family.ownerId === targetUserId) {
            throw new common_1.ForbiddenException('Grup kurucusu/sahibi gruptan Ã§Ä±karÄ±lamaz.');
        }
        if (userId === targetUserId) {
            throw new common_1.ForbiddenException('Kendinizi gruptan Ã§Ä±karamazsÄ±nÄ±z. Gruptan ayrÄ±lmak iÃ§in "AyrÄ±l" Ã¶zelliÄŸini kullanÄ±n.');
        }
        if (targetMembership.memberType === client_1.MemberType.child || targetMembership.memberType === client_1.MemberType.elder) {
            const alertTitle = 'ğŸš« GRUPTAN Ã‡IKARILDI';
            const alertMsg = `${targetMembership.user.name}, veli tarafÄ±ndan aile grubundan Ã§Ä±karÄ±ldÄ± ve konum takibi sonlandÄ±rÄ±ldÄ±!`;
            await this.prisma.alert.create({
                data: {
                    familyId,
                    userId: targetUserId,
                    type: 'family_leave',
                    title: alertTitle,
                    message: alertMsg,
                    status: 'active'
                }
            });
            await this.notificationsService.sendFamilyNotification(familyId, targetUserId, alertTitle, alertMsg, { type: 'family_leave', userId: targetUserId });
        }
        await this.prisma.familyMember.delete({
            where: {
                familyId_userId: { familyId, userId: targetUserId }
            }
        });
        return { success: true, message: 'Ãœye aile grubundan baÅŸarÄ±yla Ã§Ä±karÄ±ldÄ±.' };
    }
    async deleteFamily(userId, familyId) {
        const membership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: { familyId, userId }
            }
        });
        if (!membership || membership.memberType !== client_1.MemberType.guardian) {
            throw new common_1.ForbiddenException('Sadece veli (guardian) Ã¼yeler grubu silebilir/daÄŸÄ±tabilir.');
        }
        await this.prisma.family.delete({
            where: { id: familyId }
        });
        return { success: true, message: 'Aile grubu baÅŸarÄ±yla silindi ve daÄŸÄ±tÄ±ldÄ±.' };
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
            throw new common_1.NotFoundException('Bu aile grubunun Ã¼yesi deÄŸilsiniz.');
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
};
exports.FamiliesService = FamiliesService;
exports.FamiliesService = FamiliesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notifications_service_1.NotificationsService])
], FamiliesService);
//# sourceMappingURL=families.service.js.map