import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AlertStatus, AlertType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminQueryDto, AlertQueryDto, UserQueryDto } from './dto/admin-query.dto';
import { UpdateAdminUserDto } from './dto/update-user.dto';

@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async dashboard() {
    const now = new Date();
    const lastWeek = new Date(now);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const [users, families, activeAlerts, premiumUsers, recentUsers, recentSos, alertGroups] =
      await this.prisma.$transaction([
        this.prisma.user.count(),
        this.prisma.family.count(),
        this.prisma.alert.count({ where: { status: AlertStatus.active } }),
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
      alertDistribution: Object.entries(
        alertGroups.reduce<Record<string, number>>((counts, item) => {
          counts[item.type] = (counts[item.type] || 0) + 1;
          return counts;
        }, {}),
      )
        .map(([type, count]) => ({ type, count }))
        .sort((a, b) => b.count - a.count),
    };
  }

  async users(query: UserQueryDto) {
    const where: Prisma.UserWhereInput = {};
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
    } else {
      where.role = { not: 'admin' };
    }
    if (query.subscription === 'premium') {
      where.isPremium = true;
      where.premiumExpiresAt = { gt: now };
    } else if (query.subscription === 'trial') {
      where.trialEndsAt = { gt: now };
      where.NOT = { isPremium: true, premiumExpiresAt: { gt: now } };
    } else if (query.subscription === 'expired') {
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

  async user(id: string) {
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

    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');

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

  async userHistory(adminId: string, userId: string, dateStr?: string) {
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

    const locations = await Promise.all(
      userIds.map(async (uid) => {
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
      })
    );

    return locations.filter(Boolean);
  }

  async updateUser(adminId: string, userId: string, dto: UpdateAdminUserDto) {
    if (adminId === userId && dto.role && dto.role !== 'admin') {
      throw new BadRequestException('Kendi yönetici yetkinizi kaldıramazsınız.');
    }
    const userBefore = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true, isPremium: true } });
    if (!userBefore) throw new NotFoundException('Kullanıcı bulunamadı.');

    if (userBefore.role === 'admin' && dto.role && dto.role !== 'admin') {
      throw new BadRequestException('Diğer yöneticilerin yetkilerini değiştiremezsiniz.');
    }
    if (dto.role === 'admin' && userBefore.role !== 'admin') {
      throw new BadRequestException('Bu panelden yeni yönetici atayamazsınız.');
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

  async deleteUser(adminId: string, userId: string) {
    if (adminId === userId) throw new BadRequestException('Kendi yönetici hesabınızı silemezsiniz.');
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, role: true } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
    if (user.role === 'admin') throw new BadRequestException('Yönetici hesaplarını bu panelden silemezsiniz.');
    await this.prisma.user.delete({ where: { id: userId } });
    await this.logAction(adminId, 'USER_DELETE', userId, { name: user.name, email: user.email });
    return { success: true };
  }

  async resetDevice(adminId: string, userId: string) {
    await this.ensureUser(userId);
    await this.prisma.user.update({
      where: { id: userId },
      data: { deviceId: null },
    });
    await this.logAction(adminId, 'DEVICE_RESET', userId, {});
    return { success: true, message: 'Cihaz kilidi sıfırlandı.' };
  }

  async families(query: AdminQueryDto) {
    const where: Prisma.FamilyWhereInput = query.search ? {
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

  async family(id: string) {
    const family = await this.prisma.family.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true, email: true, phone: true } },
        members: { include: { user: { select: { id: true, name: true, email: true, phone: true, role: true } } } },
        safeZones: true,
        alerts: { take: 20, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!family) throw new NotFoundException('Aile grubu bulunamadı.');
    return family;
  }

  async deleteFamily(adminId: string, id: string) {
    const family = await this.prisma.family.findUnique({ where: { id }, select: { id: true, name: true } });
    if (!family) throw new NotFoundException('Aile grubu bulunamadı.');
    await this.prisma.family.delete({ where: { id } });
    await this.logAction(adminId, 'FAMILY_DELETE', id, { name: family.name });
    return { success: true };
  }

  async alerts(query: AlertQueryDto) {
    const where: Prisma.AlertWhereInput = {};
    if (query.status) where.status = query.status;
    if (query.type && Object.values(AlertType).includes(query.type as AlertType)) where.type = query.type as AlertType;
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

  async resolveAlert(adminId: string, id: string) {
    const alert = await this.prisma.alert.findUnique({ where: { id }, select: { id: true, type: true } });
    if (!alert) throw new NotFoundException('Alarm bulunamadı.');
    const res = await this.prisma.alert.update({
      where: { id },
      data: { status: AlertStatus.resolved, resolvedAt: new Date() },
    });
    await this.logAction(adminId, 'ALERT_RESOLVE', id, { type: alert.type });
    return res;
  }

  private async ensureUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
  }

  async logAction(adminId: string, action: string, targetId: string, details: any) {
    try {
      await this.prisma.adminAuditLog.create({
        data: {
          adminId,
          action,
          targetId,
          details: details || {},
        },
      });
    } catch (e) {
      console.error('Failed to save audit log:', e);
    }
  }

  async auditLogs(query: AdminQueryDto) {
    const where: Prisma.AdminAuditLogWhereInput = {};
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

  async broadcastNotification(
    adminId: string,
    target: 'guardians' | 'members' | 'all',
    title: string,
    message: string,
  ) {
    if (!title || !message) {
      throw new BadRequestException('Başlık ve mesaj alanları zorunludur.');
    }

    let roleFilter: string[] = [];
    if (target === 'guardians') {
      roleFilter = ['guardian'];
    } else if (target === 'members') {
      roleFilter = ['child', 'elder'];
    } else if (target === 'all') {
      roleFilter = ['guardian', 'child', 'elder'];
    } else {
      throw new BadRequestException('Geçersiz hedef kitle belirtildi.');
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

  async deleteUserTodayLocations(adminId: string, userId: string) {
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

  async deleteAllTodayLocations(adminId: string) {
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

  private paginated<T>(items: T[], total: number, page: number, limit: number) {
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
