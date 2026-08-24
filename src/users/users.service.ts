import { Injectable, NotFoundException, ForbiddenException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async findOne(id: string) {
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
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    const now = new Date();
    const userTrialActive = user.trialEndsAt > now;
    const userPremiumActive = user.isPremium && user.premiumExpiresAt && user.premiumExpiresAt > now;
    
    let isPremiumByAssociation = userTrialActive || userPremiumActive;
    let associatedPremiumExpiresAt: Date | null = userPremiumActive ? user.premiumExpiresAt : null;
    let associatedTrialEndsAt: Date | null = userTrialActive ? user.trialEndsAt : null;

    const proxyOwner = await this.prisma.user.findFirst({
      where: {
        proxyId: user.id,
      },
    });
    const isProxy = !!proxyOwner;

    if (!isPremiumByAssociation && proxyOwner) {
      const ownerTrialActive = proxyOwner.trialEndsAt > now;
      const ownerPremiumActive = proxyOwner.isPremium && proxyOwner.premiumExpiresAt && proxyOwner.premiumExpiresAt > now;
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
        const ownerPremiumActive = owner.isPremium && owner.premiumExpiresAt && owner.premiumExpiresAt > now;
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
      proxy: user.proxy ? { id: user.proxy.id, email: user.proxy.email, name: user.proxy.name } : null,
      isLocked: user.isLocked,
      devicePermissions: user.devicePermissions,
      createdAt: user.createdAt,
    };
  }

  async updateProfile(id: string, name?: string, phone?: string, gender?: string) {
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

  async purchasePremiumMock(userId: string) {
    const premiumExpiresAt = new Date();
    premiumExpiresAt.setFullYear(premiumExpiresAt.getFullYear() + 1);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        isPremium: true,
        premiumExpiresAt,
      },
    });

    return this.findOne(userId);
  }
  async setProxy(userId: string, email: string) {
    const targetUser = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!targetUser) {
      throw new NotFoundException('Vekalet atanacak kullanıcı bulunamadı.');
    }

    if (targetUser.id === userId) {
      throw new ForbiddenException('Kendinizi vekil olarak atayamazsınız.');
    }

    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { proxyId: true },
    });

    if (!currentUser) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    if (currentUser.proxyId && currentUser.proxyId !== targetUser.id) {
      const ownerFamilies = await this.prisma.family.findMany({
        where: { ownerId: userId },
      });
      for (const family of ownerFamilies) {
        await this.prisma.familyMember.deleteMany({
          where: {
            familyId: family.id,
            userId: currentUser.proxyId,
          },
        });
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { proxyId: targetUser.id },
    });

    const ownerFamilies = await this.prisma.family.findMany({
      where: { ownerId: userId },
    });
    for (const family of ownerFamilies) {
      const existing = await this.prisma.familyMember.findUnique({
        where: {
          familyId_userId: {
            familyId: family.id,
            userId: targetUser.id,
          },
        },
      });
      if (!existing) {
        await this.prisma.familyMember.create({
          data: {
            familyId: family.id,
            userId: targetUser.id,
            memberType: 'guardian',
            permissions: ['all'],
          },
        });
      }
    }

    return this.findOne(userId);
  }

  async removeProxy(userId: string) {
    const currentUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { proxyId: true },
    });

    if (!currentUser) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    if (currentUser.proxyId) {
      const ownerFamilies = await this.prisma.family.findMany({
        where: { ownerId: userId },
      });
      for (const family of ownerFamilies) {
        await this.prisma.familyMember.deleteMany({
          where: {
            familyId: family.id,
            userId: currentUser.proxyId,
          },
        });
      }

      await this.prisma.user.update({
        where: { id: userId },
        data: { proxyId: null },
      });
    }

    return this.findOne(userId);
  }

  async resetDevice(guardianId: string, childId: string) {
    const child = await this.prisma.user.findUnique({
      where: { id: childId },
    });

    if (!child) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    const guardian = await this.prisma.user.findUnique({
      where: { id: guardianId },
    });

    if (!guardian || guardian.role === 'child' || guardian.role === 'elder') {
      throw new ForbiddenException('Bu işlemi yapmaya yetkiniz yoktur.');
    }

    const membership = await this.prisma.familyMember.findFirst({
      where: {
        userId: childId,
        family: {
          members: {
            some: {
              userId: guardianId,
            },
          },
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Bu kullanıcı sizin ailenizde bulunmuyor.');
    }

    await this.prisma.user.update({
      where: { id: childId },
      data: {
        deviceId: null,
        loginAllowed: true,
      },
    });

    return {
      message: 'Cihaz kilidi başarıyla kaldırıldı. Yeni cihazla giriş yapılabilir.',
    };
  }

  async updateDevicePermissions(userId: string, permissions: any) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { devicePermissions: permissions },
    });
    return { success: true };
  }
}
