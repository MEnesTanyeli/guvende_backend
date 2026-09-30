import * as bcrypt from 'bcrypt';
import {
  ConflictException,
  UnauthorizedException,
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { MemberType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocationsGateway } from '../locations/locations.gateway';
import { OfflineSosService } from '../offline-sos/offline-sos.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private locationsGateway: LocationsGateway,
    private offlineSosService: OfflineSosService,
  ) {}

  private async lockProxyMutation(
    tx: Prisma.TransactionClient,
    ownerUserId: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`proxy-mutation:${ownerUserId}`}, 0))`;
  }

  async accountDeletionInfo(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        isPremium: true,
        premiumExpiresAt: true,
        trialEndsAt: true,
        _count: { select: { familiesOwned: true } },
      },
    });
    if (!user) throw new UnauthorizedException();
    return {
      ownsFamilies: user._count.familiesOwned > 0,
      hasActiveEntitlement:
        user.trialEndsAt > new Date() ||
        !!(
          user.isPremium &&
          user.premiumExpiresAt &&
          user.premiumExpiresAt > new Date()
        ),
    };
  }

  async deleteAccount(userId: string, password: string) {
    const familyIds = await this.prisma
      .$transaction(async (tx) => {
        // Lock the owner before collecting families; serialize password changes/deletes
        // and prevent new ownership FK references until the delete commits.
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId} FOR UPDATE`;
        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { passwordHash: true },
        });
        if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
          throw new UnauthorizedException('Hesap veya sifre dogrulanamadi.');
        }
        const families = await tx.family.findMany({
          where: { ownerId: userId },
          select: { id: true },
        });
        await tx.user.delete({ where: { id: userId } });
        return families.map((family) => family.id);
      })
      .catch((error: unknown) => {
        if (this.hasPrismaCode(error, 'P2025'))
          throw new UnauthorizedException('Hesap artik mevcut degil.');
        throw error;
      });
    this.locationsGateway.disconnectUser(userId);
    for (const familyId of familyIds)
      this.locationsGateway.clearFamilyRoom(familyId);
    return { success: true };
  }

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
    const userPremiumActive =
      user.isPremium && user.premiumExpiresAt && user.premiumExpiresAt > now;

    let isPremiumByAssociation = userTrialActive || userPremiumActive;
    let associatedPremiumExpiresAt: Date | null = userPremiumActive
      ? user.premiumExpiresAt
      : null;
    let associatedTrialEndsAt: Date | null = userTrialActive
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
      const ownerPremiumActive =
        proxyOwner.isPremium &&
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
        const ownerPremiumActive =
          owner.isPremium &&
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

  async updateProfile(
    id: string,
    name?: string,
    phone?: string,
    gender?: string,
  ) {
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

  async setProxy(userId: string, email: string) {
    try {
      await this.prisma.$transaction(
        async (tx) => {
          await this.lockProxyMutation(tx, userId);

          const requester = await tx.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true, proxyId: true },
          });
          if (!requester) {
            throw new NotFoundException('Kullanıcı bulunamadı.');
          }

          const target = await tx.user.findUnique({
            where: { email: email.toLowerCase() },
            select: { id: true, role: true, proxyId: true },
          });
          if (!target) {
            throw new NotFoundException(
              'Vekalet atanacak kullanıcı bulunamadı.',
            );
          }
          if (requester.id === target.id) {
            throw new ForbiddenException(
              'Kendinizi vekil olarak atayamazsınız.',
            );
          }
          if (
            requester.role !== MemberType.guardian ||
            target.role !== MemberType.guardian
          ) {
            throw new ForbiddenException(
              'Vekalet yalnızca guardian hesaplar arasında kurulabilir.',
            );
          }
          if (requester.proxyId) {
            throw new ForbiddenException(
              'Mevcut vekalet ilişkisini önce kaldırmalısınız.',
            );
          }
          if (target.proxyId) {
            throw new ForbiddenException(
              'Vekil hesabın zaten kendi vekaleti bulunuyor.',
            );
          }

          const requesterOwner = await tx.user.findUnique({
            where: { proxyId: requester.id },
            select: { id: true },
          });
          if (requesterOwner) {
            throw new ForbiddenException(
              'Vekil olarak atanmış kullanıcı vekil seçemez.',
            );
          }

          const targetOwner = await tx.user.findUnique({
            where: { proxyId: target.id },
            select: { id: true },
          });
          if (targetOwner) {
            throw new ForbiddenException(
              'Bu guardian zaten başka bir kullanıcının vekili.',
            );
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
                  memberType: MemberType.guardian,
                  permissions: ['all', 'proxy'],
                },
              });
            }
          }
        },
        { isolationLevel: 'Serializable' },
      );
    } catch (error) {
      if (
        this.hasPrismaCode(error, 'P2002') ||
        this.hasPrismaCode(error, 'P2034')
      ) {
        throw new ConflictException(
          'Vekalet ilişkisi eşzamanlı olarak değiştirildi. Lütfen tekrar deneyin.',
        );
      }
      throw error;
    }

    return this.findOne(userId);
  }

  async removeProxy(userId: string) {
    const removal = await this.prisma.$transaction(async (tx) => {
      await this.lockProxyMutation(tx, userId);

      const currentUser = await tx.user.findUnique({
        where: { id: userId },
        select: { proxyId: true },
      });
      if (!currentUser) {
        throw new NotFoundException('Kullanıcı bulunamadı.');
      }
      if (!currentUser.proxyId) {
        return { proxyId: null, revokedFamilyIds: [] as string[] };
      }

      const expectedProxyId = currentUser.proxyId;
      const revokedFamilyIds: string[] = [];
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
        if (deleted.count > 0) revokedFamilyIds.push(family.id);
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
        throw new ConflictException(
          'Vekalet ilişkisi eşzamanlı olarak değiştirildi. Lütfen tekrar deneyin.',
        );
      }

      return { proxyId: expectedProxyId, revokedFamilyIds };
    });

    if (removal.proxyId) {
      await Promise.all(
        removal.revokedFamilyIds.map((familyId) =>
          this.locationsGateway.revokeFamilyAccess(removal.proxyId, familyId),
        ),
      );
    }

    return this.findOne(userId);
  }

  async resetDevice(guardianId: string, childId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`session-security:${childId}`}, 0))`;

      const child = await tx.user.findUnique({
        where: { id: childId },
        select: { role: true },
      });
      if (!child) throw new NotFoundException('Kullanıcı bulunamadı.');
      if (child.role !== MemberType.child && child.role !== MemberType.elder) {
        throw new ForbiddenException(
          'Yalnız çocuk veya aile büyüğü hesaplarının cihazı sıfırlanabilir.',
        );
      }

      const memberships = await tx.familyMember.findMany({
        where: {
          userId: childId,
          memberType: { in: [MemberType.child, MemberType.elder] },
        },
        take: 2,
        select: {
          memberType: true,
          family: { select: { ownerId: true } },
        },
      });
      if (memberships.length !== 1) {
        throw new ConflictException(
          'Cihaz sıfırlama için tek ve doğrulanabilir bir aile belirlenemedi.',
        );
      }
      if (
        memberships[0].memberType !== child.role ||
        memberships[0].family.ownerId !== guardianId
      ) {
        throw new ForbiddenException(
          'Cihazı yalnız ilgili ailenin sahibi sıfırlayabilir.',
        );
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
      message:
        'Eski cihaz oturumları kapatıldı ve cihaz kilidi kaldırıldı. Yeni cihazla giriş yapılabilir.',
    };
  }

  async updateDevicePermissions(
    userId: string,
    permissions: Prisma.InputJsonObject,
  ) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { devicePermissions: permissions },
    });
    return { success: true };
  }

  private hasPrismaCode(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: unknown }).code === code
    );
  }
}
