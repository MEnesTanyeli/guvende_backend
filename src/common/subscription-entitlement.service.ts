import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionEntitlementService {
  constructor(private readonly prisma: PrismaService) {}

  private activeWhere(now: Date) {
    return {
      OR: [
        { trialEndsAt: { gt: now } },
        { isPremium: true, premiumExpiresAt: { gt: now } },
      ],
    };
  }

  private assertEnabled(): void {
    if (process.env.EARLY_ACCESS_ENABLED === 'true') return;
  }

  async isUserEntitled(userId: string): Promise<boolean> {
    if (process.env.EARLY_ACCESS_ENABLED === 'true') return true;
    return !!(await this.prisma.user.findFirst({
      where: { id: userId, ...this.activeWhere(new Date()) },
      select: { id: true },
    }));
  }

  async isFamilyEntitled(familyId: string): Promise<boolean> {
    if (process.env.EARLY_ACCESS_ENABLED === 'true') return true;
    return !!(await this.prisma.family.findFirst({
      where: { id: familyId, owner: this.activeWhere(new Date()) },
      select: { id: true },
    }));
  }

  async assertUserEntitled(userId: string): Promise<void> {
    this.assertEnabled();
    if (await this.isUserEntitled(userId)) return;
    this.deny();
  }

  async assertFamilyEntitled(familyId: string): Promise<void> {
    this.assertEnabled();
    if (await this.isFamilyEntitled(familyId)) return;
    this.deny();
  }

  private deny(): never {
    throw new ForbiddenException({
      statusCode: 403,
      message:
        'Bu ailenin kullanım süresi dolmuştur. Premium takip özellikleri kullanılamaz.',
      error: 'TRIAL_EXPIRED',
    });
  }
}
