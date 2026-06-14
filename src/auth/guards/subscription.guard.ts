import { CanActivate, ExecutionContext, Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // JwtAuthGuard tarafından eklenmiş olmalı

    if (!user || !user.id) {
      return false;
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
      include: {
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

    if (!dbUser) {
      return false;
    }

    const now = new Date();

    // 1. Kullanıcının kendisi premium mu veya deneme süresi aktif mi?
    const userTrialActive = dbUser.trialEndsAt > now;
    const userPremiumActive = dbUser.isPremium && dbUser.premiumExpiresAt && dbUser.premiumExpiresAt > now;

    if (userTrialActive || userPremiumActive) {
      return true;
    }

    // 2. Üyesi olduğu ailelerden herhangi birinin kurucusu/sahibi premium mu veya denemesi aktif mi?
    for (const membership of dbUser.memberships) {
      const owner = membership.family.owner;
      const ownerTrialActive = owner.trialEndsAt > now;
      const ownerPremiumActive = owner.isPremium && owner.premiumExpiresAt && owner.premiumExpiresAt > now;

      if (ownerTrialActive || ownerPremiumActive) {
        return true;
      }
    }

    // Şartlar sağlanmıyorsa özel bir hata koduyla hata fırlat
    throw new ForbiddenException({
      statusCode: 403,
      message: 'Uygulama kullanım süreniz dolmuştur. Devam etmek için lütfen premium üyelik alınız.',
      error: 'TRIAL_EXPIRED',
    });
  }
}
