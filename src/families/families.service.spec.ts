import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MemberType } from '@prisma/client';
import { FamiliesService } from './families.service';

describe('FamiliesService authorization', () => {
  const setup = () => {
    const prisma: any = {
      user: { findUnique: jest.fn() },
      family: { findFirst: jest.fn(), findUnique: jest.fn() },
      familyMember: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
        create: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    const notifications = { raiseFamilyAlert: jest.fn() };
    const offlineSos = { createInitialKey: jest.fn(), rotateKey: jest.fn() };
    return {
      prisma,
      notifications,
      offlineSos,
      service: new FamiliesService(prisma, notifications as any, {
        revokeFamilyAccess: jest.fn(),
      } as any, offlineSos as any),
    };
  };

  it('does not allow child accounts to create a family', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue({ role: 'child', proxyId: null });
    await expect(
      service.create('child', { name: 'Ailem' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects duplicate family names for the same owner', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue({
      role: 'guardian',
      proxyId: null,
    });
    prisma.family.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(
      service.create('u1', { name: 'Ailem' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates the owner membership as guardian in the same transaction', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue({
      role: 'guardian',
      proxyId: null,
    });
    prisma.family.findFirst.mockResolvedValue(null);
    prisma.familyMember.count.mockResolvedValue(0);
    const tx = {
      family: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'f1' }),
      },
      familyMember: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));
    await service.create('u1', { name: 'Ailem' });
    expect(tx.familyMember.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        familyId: 'f1',
        userId: 'u1',
        memberType: MemberType.guardian,
      }),
    });
  });

  it('prevents a non-member from reading another family', async () => {
    const { prisma, service } = setup();
    prisma.familyMember.findUnique.mockResolvedValue(null);
    await expect(
      service.findOne('attacker', 'family-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents joining the same family twice', async () => {
    const { prisma, service } = setup();
    prisma.family.findUnique.mockResolvedValue({ id: 'f1' });
    prisma.user.findUnique.mockResolvedValue({ role: 'guardian' });
    prisma.familyMember.count.mockResolvedValue(0);
    prisma.familyMember.findUnique.mockResolvedValue({ id: 'membership' });
    await expect(
      service.join('u1', { inviteCode: 'CODE' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.family.findUnique).toHaveBeenCalledWith({
      where: { inviteCode: 'CODE' },
    });
  });

  it('does not treat an admin account as a guardian profile', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue({ role: 'admin', proxyId: null });
    await expect(
      service.create('admin', { name: 'Ailem' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects a global role that cannot become a family member type', async () => {
    const { prisma, service } = setup();
    prisma.family.findUnique.mockResolvedValue({ id: 'f1' });
    prisma.user.findUnique.mockResolvedValue({ role: 'admin' });

    await expect(
      service.join('admin', { inviteCode: 'CODE' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.familyMember.create).not.toHaveBeenCalled();
  });

  it('cleans only the leaving users geofence states for that family in the membership transaction', async () => {
    const { prisma, service } = setup();
    prisma.familyMember.findUnique.mockResolvedValue({
      userId: 'child', memberType: MemberType.child, user: { name: 'Child' },
    });
    prisma.family.findUnique.mockResolvedValue({
      id: 'family-a', ownerId: 'owner', members: [{ memberType: MemberType.guardian }, { memberType: MemberType.child }],
    });
    const tx = {
      geofenceState: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      familyMember: { delete: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));

    await service.leave('child', 'family-a');

    expect(tx.geofenceState.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'child', safeZone: { familyId: 'family-a' } },
    });
    expect(tx.familyMember.delete).toHaveBeenCalled();
  });

  it('cleans the removed members family-scoped geofence states in the same transaction', async () => {
    const { prisma, service } = setup();
    prisma.familyMember.findUnique
      .mockResolvedValueOnce({ memberType: MemberType.guardian })
      .mockResolvedValueOnce({ userId: 'target', memberType: MemberType.guardian, user: { name: 'Target' } });
    prisma.family.findUnique.mockResolvedValue({ ownerId: 'owner' });
    const tx = {
      geofenceState: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      familyMember: { delete: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));

    await service.removeMember('guardian', 'family-a', 'target');

    expect(tx.geofenceState.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'target', safeZone: { familyId: 'family-a' } },
    });
    expect(tx.familyMember.delete).toHaveBeenCalled();
  });
});
