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
const notifications_service_1 = require("../notifications/notifications.service");
let AdminService = class AdminService {
    prisma;
    notificationsService;
    constructor(prisma, notificationsService) {
        this.prisma = prisma;
        this.notificationsService = notificationsService;
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
        if (query.role) {
            where.role = query.role;
        }
        else {
            where.role = { not: 'admin' };
        }
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
    async user(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                isPremium: true,
                premiumExpiresAt: true,
                trialEndsAt: true,
                deviceId: true,
                loginAllowed: true,
                devicePermissions: true,
                createdAt: true,
                memberships: {
                    include: {
                        family: {
                            select: {
                                id: true,
                                name: true,
                            },
                        },
                    },
                },
                alerts: {
                    take: 10,
                    orderBy: { createdAt: 'desc' },
                },
            },
        });
        if (!user)
            throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
        const latestLocation = await this.prisma.location.findFirst({
            where: { userId: id },
            orderBy: { recordedAt: 'desc' },
            select: {
                latitude: true,
                longitude: true,
                batteryLevel: true,
                isCharging: true,
                connectionStatus: true,
                recordedAt: true,
            },
        });
        return {
            ...user,
            latestLocation,
        };
    }
    async userHistory(adminId, userId, dateStr) {
        const date = dateStr ? new Date(dateStr) : new Date();
        const startOfDay = new Date(date.setHours(0, 0, 0, 0));
        const endOfDay = new Date(date.setHours(23, 59, 59, 999));
        const history = await this.prisma.location.findMany({
            where: {
                userId,
                recordedAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
            orderBy: {
                recordedAt: 'asc',
            },
            select: {
                id: true,
                latitude: true,
                longitude: true,
                recordedAt: true,
                batteryLevel: true,
                speed: true,
            },
        });
        await this.logAction(adminId, 'LOCATION_HISTORY_VIEW', userId, { date: dateStr || new Date().toISOString().split('T')[0] });
        return history;
    }
    async latestLocations() {
        const childAndElderUsers = await this.prisma.user.findMany({
            where: {
                role: { in: ['child', 'elder'] }
            },
            select: { id: true, name: true, email: true, role: true }
        });
        const userIds = childAndElderUsers.map(u => u.id);
        const locations = await Promise.all(userIds.map(async (uid) => {
            const loc = await this.prisma.location.findFirst({
                where: { userId: uid },
                orderBy: { recordedAt: 'desc' },
                include: {
                    user: {
                        select: { id: true, name: true, email: true, role: true }
                    }
                }
            });
            return loc;
        }));
        return locations.filter(Boolean);
    }
    async updateUser(adminId, userId, dto) {
        if (adminId === userId && dto.role && dto.role !== 'admin') {
            throw new common_1.BadRequestException('Kendi yönetici yetkinizi kaldıramazsınız.');
        }
        const userBefore = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, isPremium: true } });
        if (!userBefore)
            throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
        if (userBefore.role === 'admin' && dto.role && dto.role !== 'admin') {
            throw new common_1.BadRequestException('Diğer yöneticilerin yetkilerini değiştiremezsiniz.');
        }
        if (dto.role === 'admin' && userBefore.role !== 'admin') {
            throw new common_1.BadRequestException('Bu panelden yeni yönetici atayamazsınız.');
        }
        const user = await this.prisma.user.update({
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
        if (dto.role !== undefined && dto.role !== userBefore.role) {
            await this.logAction(adminId, 'ROLE_CHANGE', userId, { from: userBefore.role, to: dto.role });
        }
        if (dto.isPremium !== undefined && dto.isPremium !== userBefore.isPremium) {
            await this.logAction(adminId, 'PREMIUM_TOGGLE', userId, { from: userBefore.isPremium, to: dto.isPremium });
        }
        return user;
    }
    async deleteUser(adminId, userId) {
        if (adminId === userId)
            throw new common_1.BadRequestException('Kendi yönetici hesabınızı silemezsiniz.');
        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true } });
        if (!user)
            throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
        if (user.role === 'admin')
            throw new common_1.BadRequestException('Yönetici hesaplarını bu panelden silemezsiniz.');
        await this.prisma.user.delete({ where: { id: userId } });
        await this.logAction(adminId, 'USER_DELETE', userId, { name: user.name, email: user.email });
        return { success: true };
    }
    async resetDevice(adminId, userId) {
        await this.ensureUser(userId);
        await this.prisma.user.update({
            where: { id: userId },
            data: { deviceId: null },
        });
        await this.logAction(adminId, 'DEVICE_RESET', userId, {});
        return { success: true, message: 'Cihaz kilidi sıfırlandı.' };
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
    async deleteFamily(adminId, id) {
        const family = await this.prisma.family.findUnique({ where: { id }, select: { id: true, name: true } });
        if (!family)
            throw new common_1.NotFoundException('Aile grubu bulunamadı.');
        await this.prisma.family.delete({ where: { id } });
        await this.logAction(adminId, 'FAMILY_DELETE', id, { name: family.name });
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
    async resolveAlert(adminId, id) {
        const alert = await this.prisma.alert.findUnique({ where: { id }, select: { id: true, type: true } });
        if (!alert)
            throw new common_1.NotFoundException('Alarm bulunamadı.');
        const res = await this.prisma.alert.update({
            where: { id },
            data: { status: client_1.AlertStatus.resolved, resolvedAt: new Date() },
        });
        await this.logAction(adminId, 'ALERT_RESOLVE', id, { type: alert.type });
        return res;
    }
    async ensureUser(id) {
        const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
        if (!user)
            throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
    }
    async logAction(adminId, action, targetId, details) {
        try {
            await this.prisma.adminAuditLog.create({
                data: {
                    adminId,
                    action,
                    targetId,
                    details: details || {},
                },
            });
        }
        catch (e) {
            console.error('Failed to save audit log:', e);
        }
    }
    async auditLogs(query) {
        const where = {};
        if (query.search) {
            where.OR = [
                { action: { contains: query.search, mode: 'insensitive' } },
                { admin: { name: { contains: query.search, mode: 'insensitive' } } },
                { admin: { email: { contains: query.search, mode: 'insensitive' } } },
            ];
        }
        const [items, total] = await this.prisma.$transaction([
            this.prisma.adminAuditLog.findMany({
                where,
                skip: (query.page - 1) * query.limit,
                take: query.limit,
                orderBy: { createdAt: 'desc' },
                include: {
                    admin: { select: { id: true, name: true, email: true } },
                },
            }),
            this.prisma.adminAuditLog.count({ where }),
        ]);
        return this.paginated(items, total, query.page, query.limit);
    }
    async broadcastNotification(adminId, target, title, message) {
        if (!title || !message) {
            throw new common_1.BadRequestException('Başlık ve mesaj alanları zorunludur.');
        }
        let roleFilter = [];
        if (target === 'guardians') {
            roleFilter = ['guardian'];
        }
        else if (target === 'members') {
            roleFilter = ['child', 'elder'];
        }
        else if (target === 'all') {
            roleFilter = ['guardian', 'child', 'elder'];
        }
        else {
            throw new common_1.BadRequestException('Geçersiz hedef kitle belirtildi.');
        }
        const users = await this.prisma.user.findMany({
            where: { role: { in: roleFilter } },
            select: { id: true }
        });
        const userIds = users.map(u => u.id);
        if (userIds.length > 0) {
            await this.notificationsService.sendOneSignalNotification(userIds, title, message, {
                action: 'system_broadcast',
                sentBy: adminId
            });
        }
        await this.logAction(adminId, 'SYSTEM_BROADCAST', 'system', { target, title, message, userCount: userIds.length });
        return { success: true, userCount: userIds.length };
    }
    async deleteUserTodayLocations(adminId, userId) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const deleteResult = await this.prisma.location.deleteMany({
            where: {
                userId,
                recordedAt: {
                    gte: todayStart,
                    lte: todayEnd,
                },
            },
        });
        await this.logAction(adminId, 'USER_TODAY_LOCATIONS_DELETE', userId, { count: deleteResult.count });
        return { success: true, count: deleteResult.count };
    }
    async deleteAllTodayLocations(adminId) {
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);
        const deleteResult = await this.prisma.location.deleteMany({
            where: {
                recordedAt: {
                    gte: todayStart,
                    lte: todayEnd,
                },
            },
        });
        await this.logAction(adminId, 'ALL_TODAY_LOCATIONS_DELETE', 'system', { count: deleteResult.count });
        return { success: true, count: deleteResult.count };
    }
    paginated(items, total, page, limit) {
        return { items, total, page, limit, pages: Math.ceil(total / limit) };
    }
};
exports.AdminService = AdminService;
exports.AdminService = AdminService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        notifications_service_1.NotificationsService])
], AdminService);
//# sourceMappingURL=admin.service.js.map