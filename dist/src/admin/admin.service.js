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
exports.AdminService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
let AdminService = class AdminService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async dashboard() {
        const now = new Date();
        const lastWeek = new Date(now);
        lastWeek.setDate(lastWeek.getDate() - 7);
        const [users, families, activeAlerts, premiumUsers, recentUsers, recentSos, alertGroups] = await this.prisma.$transaction([
            this.prisma.user.count(),
            this.prisma.family.count(),
            this.prisma.alert.count({ where: { status: client_1.AlertStatus.active } }),
            this.prisma.user.count({ where: { isPremium: true, premiumExpiresAt: { gt: now } } }),
            this.prisma.user.findMany({
                take: 5,
                orderBy: { createdAt: 'desc' },
                select: { id: true, name: true, email: true, role: true, createdAt: true },
            }),
            this.prisma.sosEvent.count({ where: { createdAt: { gte: lastWeek } } }),
            this.prisma.alert.findMany({
                where: { createdAt: { gte: lastWeek } },
                select: { type: true },
            }),
        ]);
        return {
            totals: { users, families, activeAlerts, premiumUsers, recentSos },
            recentUsers,
            alertDistribution: Object.entries(alertGroups.reduce((counts, item) => {
                counts[item.type] = (counts[item.type] || 0) + 1;
                return counts;
            }, {}))
                .map(([type, count]) => ({ type, count }))
                .sort((a, b) => b.count - a.count),
        };
    }
    async users(query) {
        const where = {};
        const now = new Date();
        if (query.search) {
            where.OR = [
                { name: { contains: query.search, mode: 'insensitive' } },
                { email: { contains: query.search, mode: 'insensitive' } },
                { phone: { contains: query.search, mode: 'insensitive' } },
            ];
        }
        if (query.role)
            where.role = query.role;
        if (query.subscription === 'premium') {
            where.isPremium = true;
            where.premiumExpiresAt = { gt: now };
        }
        else if (query.subscription === 'trial') {
            where.trialEndsAt = { gt: now };
            where.NOT = { isPremium: true, premiumExpiresAt: { gt: now } };
        }
        else if (query.subscription === 'expired') {
            where.trialEndsAt = { lte: now };
            where.AND = [{ OR: [{ isPremium: false }, { premiumExpiresAt: null }, { premiumExpiresAt: { lte: now } }] }];
        }
        const [items, total] = await this.prisma.$transaction([
            this.prisma.user.findMany({
                where,
                skip: (query.page - 1) * query.limit,
                take: query.limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true, name: true, email: true, phone: true, role: true, isPremium: true,
                    premiumExpiresAt: true, trialEndsAt: true, createdAt: true,
                    _count: { select: { memberships: true, alerts: true } },
                },
            }),
            this.prisma.user.count({ where }),
        ]);
        return this.paginated(items, total, query.page, query.limit);
    }
    async updateUser(adminId, userId, dto) {
        if (adminId === userId && dto.role && dto.role !== 'admin') {
            throw new common_1.BadRequestException('Kendi yönetici yetkinizi kaldıramazsınız.');
        }
        await this.ensureUser(userId);
        return this.prisma.user.update({
            where: { id: userId },
            data: {
                ...(dto.role !== undefined && { role: dto.role }),
                ...(dto.isPremium !== undefined && { isPremium: dto.isPremium }),
                ...(dto.premiumExpiresAt !== undefined && { premiumExpiresAt: new Date(dto.premiumExpiresAt) }),
            },
            select: {
                id: true, name: true, email: true, role: true, isPremium: true,
                premiumExpiresAt: true, trialEndsAt: true,
            },
        });
    }
    async deleteUser(adminId, userId) {
        if (adminId === userId)
            throw new common_1.BadRequestException('Kendi yönetici hesabınızı silemezsiniz.');
        await this.ensureUser(userId);
        await this.prisma.user.delete({ where: { id: userId } });
        return { success: true };
    }
    async families(query) {
        const where = query.search ? {
            OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { owner: { name: { contains: query.search, mode: 'insensitive' } } },
                { owner: { email: { contains: query.search, mode: 'insensitive' } } },
            ],
        } : {};
        const [items, total] = await this.prisma.$transaction([
            this.prisma.family.findMany({
                where,
                skip: (query.page - 1) * query.limit,
                take: query.limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    owner: { select: { id: true, name: true, email: true } },
                    _count: { select: { members: true, alerts: true, safeZones: true } },
                },
            }),
            this.prisma.family.count({ where }),
        ]);
        return this.paginated(items, total, query.page, query.limit);
    }
    async family(id) {
        const family = await this.prisma.family.findUnique({
            where: { id },
            include: {
                owner: { select: { id: true, name: true, email: true, phone: true } },
                members: { include: { user: { select: { id: true, name: true, email: true, phone: true, role: true } } } },
                safeZones: true,
                alerts: { take: 20, orderBy: { createdAt: 'desc' } },
            },
        });
        if (!family)
            throw new common_1.NotFoundException('Aile grubu bulunamadı.');
        return family;
    }
    async deleteFamily(id) {
        const family = await this.prisma.family.findUnique({ where: { id }, select: { id: true } });
        if (!family)
            throw new common_1.NotFoundException('Aile grubu bulunamadı.');
        await this.prisma.family.delete({ where: { id } });
        return { success: true };
    }
    async alerts(query) {
        const where = {};
        if (query.status)
            where.status = query.status;
        if (query.type && Object.values(client_1.AlertType).includes(query.type))
            where.type = query.type;
        if (query.search) {
            where.OR = [
                { title: { contains: query.search, mode: 'insensitive' } },
                { message: { contains: query.search, mode: 'insensitive' } },
                { user: { name: { contains: query.search, mode: 'insensitive' } } },
                { family: { name: { contains: query.search, mode: 'insensitive' } } },
            ];
        }
        const [items, total] = await this.prisma.$transaction([
            this.prisma.alert.findMany({
                where,
                skip: (query.page - 1) * query.limit,
                take: query.limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: { select: { id: true, name: true, email: true } },
                    family: { select: { id: true, name: true } },
                },
            }),
            this.prisma.alert.count({ where }),
        ]);
        return this.paginated(items, total, query.page, query.limit);
    }
    async resolveAlert(id) {
        const alert = await this.prisma.alert.findUnique({ where: { id }, select: { id: true } });
        if (!alert)
            throw new common_1.NotFoundException('Alarm bulunamadı.');
        return this.prisma.alert.update({
            where: { id },
            data: { status: client_1.AlertStatus.resolved, resolvedAt: new Date() },
        });
    }
    async ensureUser(id) {
        const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
        if (!user)
            throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
    }
    paginated(items, total, page, limit) {
        return { items, total, page, limit, pages: Math.ceil(total / limit) };
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminService);
//# sourceMappingURL=admin.service.js.map