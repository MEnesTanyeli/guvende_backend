import { ConflictException, ForbiddenException } from '@nestjs/common';
import { MemberType } from '@prisma/client';
import { FamiliesService } from './families.service';

describe('FamiliesService authorization', () => {
  const setup = () => {
    const prisma: any = {
      user: { findUnique: jest.fn() },
      family: { findFirst: jest.fn(), findUnique: jest.fn() },
      familyMember: { findUnique: jest.fn(), findMany: jest.fn(), count: jest.fn(), create: jest.fn() },
      $transaction: jest.fn(),
    };
    return { prisma, service: new FamiliesService(prisma, {} as any) };
  };

  it('does not allow child accounts to create a family', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue({ role: 'child', proxyId: null });
    await expect(service.create('child', { name: 'Ailem' } as any)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects duplicate family names for the same owner', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue({ role: 'guardian', proxyId: null });
    prisma.family.findFirst.mockResolvedValue({ id: 'existing' });
    await expect(service.create('u1', { name: 'Ailem' } as any)).rejects.toBeInstanceOf(ConflictException);
  });

  it('creates the owner membership as guardian in the same transaction', async () => {
    const { prisma, service } = setup();
    prisma.user.findUnique.mockResolvedValue({ role: 'guardian', proxyId: null });
    prisma.family.findFirst.mockResolvedValue(null);
    prisma.familyMember.count.mockResolvedValue(0);
    const tx = {
      family: { findUnique: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'f1' }) },
      familyMember: { create: jest.fn().mockResolvedValue({}) },
    };
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));
    await service.create('u1', { name: 'Ailem' } as any);
    expect(tx.familyMember.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      familyId: 'f1', userId: 'u1', memberType: MemberType.guardian,
    }) });
  });

  it('prevents a non-member from reading another family', async () => {
    const { prisma, service } = setup();
    prisma.familyMember.findUnique.mockResolvedValue(null);
    await expect(service.findOne('attacker', 'family-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('prevents joining the same family twice', async () => {
    const { prisma, service } = setup();
    prisma.family.findFirst.mockResolvedValue({ id: 'f1' });
    prisma.user.findUnique.mockResolvedValue({ role: 'guardian' });
    prisma.familyMember.count.mockResolvedValue(0);
    prisma.familyMember.findUnique.mockResolvedValue({ id: 'membership' });
    await expect(service.join('u1', { familyId: 'CODE' } as any)).rejects.toBeInstanceOf(ConflictException);
  });
});
