import { ForbiddenException } from '@nestjs/common';
import { assertCanReadTrackingData } from './tracking-data-authorization';

describe('tracking data authorization', () => {
  const setup = (authorized: boolean) => ({
    familyMember: {
      findFirst: jest.fn().mockResolvedValue(authorized ? { id: 'member' } : null),
    },
  }) as any;

  it.each(['guardian to same-family child', 'guardian to same-family elder'])('allows %s', async () => {
    await expect(assertCanReadTrackingData(setup(true), 'guardian', 'target')).resolves.toBeUndefined();
  });

  it.each(['child to another child', 'child to elder', 'elder to child', 'elder to another elder', 'guardian to different-family child', 'guardian to guardian'])('denies %s', async () => {
    await expect(assertCanReadTrackingData(setup(false), 'requester', 'target')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it.each(['child', 'elder'])('preserves %s self-access', async () => {
    const prisma = setup(false);
    await expect(assertCanReadTrackingData(prisma, 'self', 'self')).resolves.toBeUndefined();
    expect(prisma.familyMember.findFirst).not.toHaveBeenCalled();
  });

  it('uses one query for guardian requester, shared family, and trackable target', async () => {
    const prisma = setup(true);
    await assertCanReadTrackingData(prisma, 'guardian', 'target');
    expect(prisma.familyMember.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        userId: 'target',
        memberType: { in: ['child', 'elder'] },
        family: { members: { some: { userId: 'guardian', memberType: 'guardian' } } },
      }),
      select: { id: true },
    });
  });
});
