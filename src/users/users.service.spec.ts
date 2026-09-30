import { ConflictException, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';

const guardian = (id: string, proxyId: string | null = null) => ({
  id,
  role: 'guardian',
  proxyId,
});

describe('UsersService proxy authorization', () => {
  const setup = () => {
    const prisma: any = {
      user: { findUnique: jest.fn(), update: jest.fn() },
      family: { findMany: jest.fn() },
      familyMember: {
        findUnique: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      geofenceState: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(async (callback: any) =>
      callback(prisma),
    );
    const locationsGateway = { revokeFamilyAccess: jest.fn() };
    const service = new UsersService(prisma, locationsGateway as any, {
      rotateKey: jest.fn(),
    } as any);
    jest.spyOn(service, 'findOne').mockResolvedValue({ id: 'owner' } as any);
    return { prisma, service, locationsGateway };
  };

  function mockProxyLookup(
    prisma: any,
    requester: { id: string; role: string; proxyId: string | null },
    target: { id: string; role: string; proxyId: string | null },
    proxyOwners: Record<string, { id: string } | null> = {},
  ) {
    prisma.user.findUnique.mockImplementation(({ where }: any) => {
      if (where.id === requester.id) return Promise.resolve(requester);
      if (where.email === 'target@guvende.test') return Promise.resolve(target);
      if (where.proxyId)
        return Promise.resolve(proxyOwners[where.proxyId] ?? null);
      return Promise.resolve(null);
    });
  }

  it('allows guardian to guardian proxy assignment and marks added membership as proxy', async () => {
    const { prisma, service, locationsGateway } = setup();
    mockProxyLookup(prisma, guardian('owner'), guardian('target'));
    prisma.family.findMany.mockResolvedValue([{ id: 'family-1' }]);
    prisma.familyMember.findUnique.mockResolvedValue(null);

    await expect(
      service.setProxy('owner', 'target@guvende.test'),
    ).resolves.toEqual({
      id: 'owner',
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'owner' },
      data: { proxyId: 'target' },
    });
    expect(prisma.familyMember.create).toHaveBeenCalledWith({
      data: {
        familyId: 'family-1',
        userId: 'target',
        memberType: 'guardian',
        permissions: ['all', 'proxy'],
      },
    });
  });

  it.each([
    [
      'guardian to child',
      guardian('owner'),
      { id: 'target', role: 'child', proxyId: null },
    ],
    [
      'guardian to elder',
      guardian('owner'),
      { id: 'target', role: 'elder', proxyId: null },
    ],
    [
      'child to guardian',
      { id: 'owner', role: 'child', proxyId: null },
      guardian('target'),
    ],
    [
      'elder to guardian',
      { id: 'owner', role: 'elder', proxyId: null },
      guardian('target'),
    ],
  ])('rejects %s', async (_label, requester, target) => {
    const { prisma, service } = setup();
    mockProxyLookup(prisma, requester, target);

    await expect(
      service.setProxy('owner', 'target@guvende.test'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it.each([
    [
      'owner already has a proxy',
      guardian('owner', 'other'),
      guardian('target'),
      {},
    ],
    [
      'target has own proxy',
      guardian('owner'),
      guardian('target', 'other'),
      {},
    ],
    [
      'requester is another owner proxy',
      guardian('owner'),
      guardian('target'),
      { owner: { id: 'other' } },
    ],
    [
      'target is another owner proxy',
      guardian('owner'),
      guardian('target'),
      { target: { id: 'other' } },
    ],
  ])('rejects when %s', async (_label, requester, target, proxyOwners) => {
    const { prisma, service } = setup();
    mockProxyLookup(prisma, requester, target, proxyOwners);

    await expect(
      service.setProxy('owner', 'target@guvende.test'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });

  it('rejects self proxy', async () => {
    const { prisma, service } = setup();
    mockProxyLookup(prisma, guardian('owner'), guardian('owner'));

    await expect(
      service.setProxy('owner', 'target@guvende.test'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('converts a unique-constraint race into a conflict response', async () => {
    const { prisma, service } = setup();
    prisma.$transaction.mockRejectedValue({ code: 'P2002' });

    await expect(
      service.setProxy('owner', 'target@guvende.test'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('removes only proxy-marked family memberships so both sides can be reused', async () => {
    const { prisma, service, locationsGateway } = setup();
    prisma.user.findUnique.mockResolvedValue({ proxyId: 'target' });
    prisma.family.findMany.mockResolvedValue([{ id: 'family-1' }]);

    await expect(service.removeProxy('owner')).resolves.toEqual({
      id: 'owner',
    });

    expect(prisma.familyMember.deleteMany).toHaveBeenCalledWith({
      where: {
        familyId: 'family-1',
        userId: 'target',
        permissions: { has: 'proxy' },
      },
    });
    expect(prisma.geofenceState.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'target', safeZone: { familyId: 'family-1' } },
    });
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'owner' },
      data: { proxyId: null },
    });
    expect(locationsGateway.revokeFamilyAccess).toHaveBeenCalledWith(
      'target',
      'family-1',
    );
  });

  it('does not revoke realtime access when proxy removal keeps a legitimate membership', async () => {
    const { prisma, service, locationsGateway } = setup();
    prisma.user.findUnique.mockResolvedValue({ proxyId: 'target' });
    prisma.family.findMany.mockResolvedValue([{ id: 'family-1' }]);
    prisma.familyMember.deleteMany.mockResolvedValue({ count: 0 });

    await service.removeProxy('owner');

    expect(locationsGateway.revokeFamilyAccess).not.toHaveBeenCalled();
  });
});
