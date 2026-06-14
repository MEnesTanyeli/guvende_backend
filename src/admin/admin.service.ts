import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AlertStatus, AlertType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminQueryDto, AlertQueryDto, UserQueryDto } from './dto/admin-query.dto';
import { UpdateAdminUserDto } from './dto/update-user.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

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
    if (query.role) where.role = query.role;
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

  async updateUser(adminId: string, userId: string, dto: UpdateAdminUserDto) {
    if (adminId === userId && dto.role && dto.role !== 'admin') {
      throw new BadRequestException('Kendi yönetici yetkinizi kaldıramazsınız.');
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

  async deleteUser(adminId: string, userId: string) {
    if (adminId === userId) throw new BadRequestException('Kendi yönetici hesabınızı silemezsiniz.');
    await this.ensureUser(userId);
    await this.prisma.user.delete({ where: { id: userId } });
    return { success: true };
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

  async deleteFamily(id: string) {
    const family = await this.prisma.family.findUnique({ where: { id }, select: { id: true } });
    if (!family) throw new NotFoundException('Aile grubu bulunamadı.');
    await this.prisma.family.delete({ where: { id } });
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

  async resolveAlert(id: string) {
    const alert = await this.prisma.alert.findUnique({ where: { id }, select: { id: true } });
    if (!alert) throw new NotFoundException('Alarm bulunamadı.');
    return this.prisma.alert.update({
      where: { id },
      data: { status: AlertStatus.resolved, resolvedAt: new Date() },
    });
  }

  private async ensureUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { id: true } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
  }

  private paginated<T>(items: T[], total: number, page: number, limit: number) {
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }
}
