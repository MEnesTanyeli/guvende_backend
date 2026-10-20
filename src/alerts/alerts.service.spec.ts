import { ForbiddenException } from '@nestjs/common';
import { MemberType } from '@prisma/client';
import { AlertsService } from './alerts.service';

describe('AlertsService response authorization', () => {
  const setup = (membership: any) => {
    const prisma: any = {
      familyMember: { findUnique: jest.fn().mockResolvedValue(membership) },
      alert: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const subscriptionEntitlement = {
      assertFamilyEntitled: jest.fn().mockResolvedValue(undefined),
    };
    return {
      prisma,
      service: new AlertsService(prisma, subscriptionEntitlement as any),
    };
  };

  it('returns only the user id and name projection to a family guardian', async () => {
    const { prisma, service } = setup({ memberType: MemberType.guardian });
    await service.findAll('guardian', 'family-a');
    expect(prisma.alert.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        familyId: 'family-a',
        family: {
          members: {
            some: { userId: 'guardian', memberType: MemberType.guardian },
          },
        },
      },
      include: { user: { select: { id: true, name: true } } },
    }));
  });

  it.each([null, { memberType: MemberType.child }, { memberType: MemberType.elder }])(
    'rejects non-guardian membership %#',
    async (membership) => {
      const { prisma, service } = setup(membership);
      await expect(service.findAll('user', 'family-a')).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.alert.findMany).not.toHaveBeenCalled();
    },
  );
});
