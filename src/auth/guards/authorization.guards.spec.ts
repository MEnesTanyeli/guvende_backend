import { ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { SubscriptionGuard } from './subscription.guard';

const context = (user: any) =>
  ({ switchToHttp: () => ({ getRequest: () => ({ user }) }) }) as any;

describe('Authorization guards', () => {
  it('allows only admin users through AdminGuard', () => {
    const guard = new AdminGuard();
    expect(guard.canActivate(context({ role: 'admin' }))).toBe(true);
    expect(() => guard.canActivate(context({ role: 'guardian' }))).toThrow(
      ForbiddenException,
    );
  });

  it('allows a user with an active trial', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          trialEndsAt: new Date(Date.now() + 60_000),
          isPremium: false,
          memberships: [],
        }),
      },
    };
    await expect(
      new SubscriptionGuard(prisma as any).canActivate(context({ id: 'u1' })),
    ).resolves.toBe(true);
  });

  it('allows a family member when the family owner has an active subscription', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          trialEndsAt: new Date(0),
          isPremium: false,
          memberships: [
            {
              family: {
                owner: {
                  trialEndsAt: new Date(Date.now() + 60_000),
                  isPremium: false,
                },
              },
            },
          ],
        }),
      },
    };
    await expect(
      new SubscriptionGuard(prisma as any).canActivate(context({ id: 'u1' })),
    ).resolves.toBe(true);
  });

  it('rejects an expired user without an active family subscription', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          trialEndsAt: new Date(0),
          isPremium: false,
          premiumExpiresAt: null,
          memberships: [],
        }),
      },
    };
    await expect(
      new SubscriptionGuard(prisma as any).canActivate(context({ id: 'u1' })),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
