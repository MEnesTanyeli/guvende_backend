import { ForbiddenException } from '@nestjs/common';
import { MemberType } from '@prisma/client';
import { MedicationsService } from './medications.service';

describe('MedicationsService reminder-read authorization', () => {
  const setup = () => {
    const prisma: any = {
      familyMember: { findFirst: jest.fn() },
      user: { findUnique: jest.fn() },
      medicationReminder: { findMany: jest.fn() },
    };
    const service = new MedicationsService(prisma, {} as any, {} as any);
    return { prisma, service };
  };

  it('allows a user to read their own reminders', async () => {
    const { prisma, service } = setup();
    prisma.medicationReminder.findMany.mockResolvedValue([]);

    await expect(service.getReminders('child-a', 'child-a')).resolves.toEqual(
      [],
    );

    expect(prisma.familyMember.findFirst).not.toHaveBeenCalled();
    expect(prisma.medicationReminder.findMany).toHaveBeenCalledWith({
      where: { userId: 'child-a', isActive: true },
      orderBy: { time: 'asc' },
    });
  });

  it.each([
    ['child', MemberType.child],
    ['elder', MemberType.elder],
  ] as const)(
    'allows a guardian to read a same-family %s reminders',
    async (_label, targetMemberType) => {
      const { prisma, service } = setup();
      prisma.familyMember.findFirst.mockResolvedValue({ id: 'membership' });
      prisma.medicationReminder.findMany.mockResolvedValue([]);

      await expect(
        service.getReminders('guardian-a', `target-${targetMemberType}`),
      ).resolves.toEqual([]);

      expect(prisma.familyMember.findFirst).toHaveBeenCalledWith({
        where: {
          userId: `target-${targetMemberType}`,
          memberType: { in: [MemberType.child, MemberType.elder] },
          family: {
            members: {
              some: {
                userId: 'guardian-a',
                memberType: MemberType.guardian,
              },
            },
          },
        },
        select: { id: true },
      });
    },
  );

  it.each([
    ['a child', 'child-a', 'child-b'],
    ['an elder', 'elder-a', 'child-b'],
    ['a guardian from another family', 'guardian-a', 'child-b'],
    ['a guardian requesting another guardian', 'guardian-a', 'guardian-b'],
  ])(
    'rejects %s reading another user reminders',
    async (_label, requesterId, targetUserId) => {
      const { prisma, service } = setup();
      prisma.familyMember.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ id: targetUserId });

      await expect(
        service.getReminders(requesterId, targetUserId),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(prisma.medicationReminder.findMany).not.toHaveBeenCalled();
    },
  );

  it('keeps the empty-list contract for an unknown target', async () => {
    const { prisma, service } = setup();
    prisma.familyMember.findFirst.mockResolvedValue(null);
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.medicationReminder.findMany.mockResolvedValue([]);

    await expect(
      service.getReminders('guardian-a', 'missing-user'),
    ).resolves.toEqual([]);
  });
});
