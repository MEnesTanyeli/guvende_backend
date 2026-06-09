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
let FamiliesService = class FamiliesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(userId, dto) {
        return this.prisma.$transaction(async (tx) => {
            const family = await tx.family.create({
                data: {
                    name: dto.name,
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
        return this.prisma.familyMember.create({
            data: {
                familyId: dto.familyId,
                userId: userId,
                memberType: dto.memberType || client_1.MemberType.child,
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
                    }
                }
            }
        });
    }
};
exports.FamiliesService = FamiliesService;
exports.FamiliesService = FamiliesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], FamiliesService);
//# sourceMappingURL=families.service.js.map