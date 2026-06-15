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
    constructor(prisma, notificationsService) {
        this.prisma = prisma;
        this.notificationsService = notificationsService;
    }
    async create(userId, dto) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true, proxyId: true },
        });
        const isGuardian = user && user.role !== 'child' && user.role !== 'elder';
        if (!isGuardian) {
            throw new common_1.ForbiddenException('Sadece veli hesapları yeni aile grubu oluşturabilir.');
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
            throw new common_1.ConflictException('Aynı isimde birden fazla aile grubu oluşturamazsınız.');
        }
        const existingFamiliesCount = await this.prisma.family.count({
            where: { ownerId: userId },
        });
        if (existingFamiliesCount >= 2) {
            throw new common_1.ForbiddenException('Bir üye en fazla 2 aile grubu oluşturabilir.');
        }
        return this.prisma.$transaction(async (tx) => {
            const family = await tx.family.create({
                data: {
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
            throw new common_1.ForbiddenException('Bu aile grubunun verilerine erişim izniniz yok.');
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
            throw new common_1.NotFoundException('Aile grubu bulunamadı.');
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
            throw new common_1.ForbiddenException('Bu aile grubuna erişim izniniz yok.');
        }
        if (membership.memberType !== client_1.MemberType.guardian) {
            throw new common_1.ForbiddenException('Sadece koruyucu (guardian) üyeler davet kodu oluşturabilir.');
        }
        return {
            familyId,
            inviteCode: familyId,
            message: 'Bu kodu diğer üyelerle paylaşarak aileye katılmalarını sağlayabilirsiniz.',
        };
    }
    async join(userId, dto) {
        const family = await this.prisma.family.findUnique({
            where: { id: dto.familyId },
        });
        if (!family) {
            throw new common_1.NotFoundException('Geçersiz aile davet kodu.');
        }
        const existingMember = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: {
                    familyId: dto.familyId,
                    userId,
                },
            },
        });
        if (existingMember) {
            throw new common_1.ConflictException('Zaten bu aile grubunun bir üyesisiniz.');
        }
        const joiningUser = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { role: true },
        });
        if (!joiningUser) {
            throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
        }
        const memberTypeToUse = dto.memberType || joiningUser.role || client_1.MemberType.child;
        if (memberTypeToUse === client_1.MemberType.guardian) {
            const guardianCount = await this.prisma.familyMember.count({
                where: {
                    familyId: dto.familyId,
                    memberType: client_1.MemberType.guardian,
                },
            });
            if (guardianCount >= 2) {
                throw new common_1.ForbiddenException('Bu aile grubunda zaten maksimum veli (2) sınırına ulaşılmış.');
            }
        }
        return this.prisma.familyMember.create({
            data: {
                familyId: dto.familyId,
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
            throw new common_1.ForbiddenException('Bu aile grubuna üye değilsiniz.');
        }
        if (editorMembership.memberType !== client_1.MemberType.guardian) {
            throw new common_1.ForbiddenException('Sadece koruyucu (guardian) üyeler başkalarının rollerini değiştirebilir.');
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
            throw new common_1.NotFoundException('Güncellenmek istenen aile üyesi grupta bulunamadı.');
        }
        const family = await this.prisma.family.findUnique({
            where: { id: familyId }
        });
        if (family && family.ownerId === targetUserId) {
            throw new common_1.ForbiddenException('Grup sahibinin rolü değiştirilemez.');
        }
        if (!Object.values(client_1.MemberType).includes(newRole)) {
            throw new common_1.ConflictException('Geçersiz üye tipi.');
        }
        if (newRole === client_1.MemberType.guardian && targetMembership.memberType !== client_1.MemberType.guardian) {
            const guardianCount = await this.prisma.familyMember.count({
                where: {
                    familyId: familyId,
                    memberType: client_1.MemberType.guardian,
                },
            });
            if (guardianCount >= 2) {
                throw new common_1.ForbiddenException('Bu aile grubunda zaten maksimum veli (2) sınırına ulaşılmış.');
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
            throw new common_1.NotFoundException('Bu aile grubunun üyesi değilsiniz.');
        }
        const family = await this.prisma.family.findUnique({
            where: { id: familyId },
            include: { members: true }
        });
        if (!family) {
            throw new common_1.NotFoundException('Aile grubu bulunamadı.');
        }
        if (membership.memberType === client_1.MemberType.guardian) {
            const guardians = family.members.filter(m => m.memberType === client_1.MemberType.guardian);
            if (guardians.length === 1) {
                return this.deleteFamily(userId, familyId);
            }
        }
        if (membership.memberType === client_1.MemberType.child || membership.memberType === client_1.MemberType.elder) {
            const remainingGuardians = family.members.filter(m => m.memberType === client_1.MemberType.guardian && m.userId !== userId);
            const alertTitle = '🚪 GRUPTAN AYRILMA';
            const alertMsg = `${membership.user.name} aile grubundan kendi isteğiyle ayrıldı ve konum takibi sonlandırıldı!`;
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
        return { success: true, message: 'Aile grubundan başarıyla ayrıldınız.' };
    }
    async removeMember(userId, familyId, targetUserId) {
        const editorMembership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: { familyId, userId }
            }
        });
        if (!editorMembership || editorMembership.memberType !== client_1.MemberType.guardian) {
            throw new common_1.ForbiddenException('Sadece veli (guardian) rolündeki üyeler gruptan üye çıkarabilir.');
        }
        const targetMembership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: { familyId, userId: targetUserId }
            },
            include: { user: true }
        });
        if (!targetMembership) {
            throw new common_1.NotFoundException('Çıkarılmak istenen üye bu aile grubunda bulunamadı.');
        }
        const family = await this.prisma.family.findUnique({
            where: { id: familyId }
        });
        if (!family) {
            throw new common_1.NotFoundException('Aile grubu bulunamadı.');
        }
        if (family.ownerId === targetUserId) {
            throw new common_1.ForbiddenException('Grup kurucusu/sahibi gruptan çıkarılamaz.');
        }
        if (userId === targetUserId) {
            throw new common_1.ForbiddenException('Kendinizi gruptan çıkaramazsınız. Gruptan ayrılmak için "Ayrıl" özelliğini kullanın.');
        }
        if (targetMembership.memberType === client_1.MemberType.child || targetMembership.memberType === client_1.MemberType.elder) {
            const alertTitle = '🚫 GRUPTAN ÇIKARILDI';
            const alertMsg = `${targetMembership.user.name}, veli tarafından aile grubundan çıkarıldı ve konum takibi sonlandırıldı!`;
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
        return { success: true, message: 'Üye aile grubundan başarıyla çıkarıldı.' };
    }
    async deleteFamily(userId, familyId) {
        const membership = await this.prisma.familyMember.findUnique({
            where: {
                familyId_userId: { familyId, userId }
            }
        });
        if (!membership || membership.memberType !== client_1.MemberType.guardian) {
            throw new common_1.ForbiddenException('Sadece veli (guardian) üyeler grubu silebilir/dağıtabilir.');
        }
        await this.prisma.family.delete({
            where: { id: familyId }
        });
        return { success: true, message: 'Aile grubu başarıyla silindi ve dağıtıldı.' };
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
};
exports.FamiliesService = FamiliesService;
exports.FamiliesService = FamiliesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notifications_service_1.NotificationsService])
], FamiliesService);
//# sourceMappingURL=families.service.js.map