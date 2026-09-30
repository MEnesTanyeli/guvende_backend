import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { MemberType } from '@prisma/client';
import { LocationsService } from './locations.service';
import { LocationsGateway } from './locations.gateway';

describe('Location and WebSocket isolation', () => {
  it('rejects more than 250 bulk points before touching persistence', async () => {
    const prisma: any = {
      user: { findUnique: jest.fn() },
      location: { findUnique: jest.fn(), create: jest.fn() },
    };
    const service = new LocationsService(prisma, {} as any, {} as any);
    const locations = Array.from({ length: 251 }, (_, index) => ({
      latitude: 41,
      longitude: 29,
      devicePointId: `point-${index}`,
      measuredAt: new Date(Date.now() - index * 1000).toISOString(),
    }));

    await expect(
      service.recordBulkLocations('user', { locations }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
    expect(prisma.location.findUnique).not.toHaveBeenCalled();
    expect(prisma.location.create).not.toHaveBeenCalled();
  });

  it('rejects latest-location access from a non-member', async () => {
    const prisma: any = {
      familyMember: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const service = new LocationsService(prisma, {} as any, {} as any);
    await expect(
      service.getLatestLocations('attacker', 'family-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a child to see only their own latest location', async () => {
    const ownLocation = {
      id: 'l1',
      userId: 'child',
      latitude: 1,
      longitude: 1,
    };
    const prisma: any = {
      familyMember: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ memberType: MemberType.child }),
      },
      safeZone: { findMany: jest.fn().mockResolvedValue([]) },
      geofenceState: { findFirst: jest.fn().mockResolvedValue(null) },
      location: { findFirst: jest.fn().mockResolvedValue(ownLocation) },
    };
    const service = new LocationsService(prisma, {} as any, {} as any);
    await expect(
      service.getLatestLocations('child', 'family-1'),
    ).resolves.toEqual([{ ...ownLocation, insideZoneName: null }]);
    expect(prisma.location.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'child' } }),
    );
  });

  it('rejects history access when the target is not in the family', async () => {
    const prisma: any = {
      familyMember: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ memberType: MemberType.guardian })
          .mockResolvedValueOnce(null),
      },
    };
    const service = new LocationsService(prisma, {} as any, {} as any);
    await expect(
      service.getLocationsHistory('guardian', 'family-1', 'outsider'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns every frontend-accepted point without a backend movement filter', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma: any = {
      familyMember: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({ memberType: MemberType.guardian })
          .mockResolvedValueOnce({ memberType: MemberType.child }),
      },
      location: { findMany },
    };
    const service = new LocationsService(prisma, {} as any, {} as any);

    await service.getLocationsHistory(
      'guardian',
      'family-1',
      'child',
      '2026-09-02',
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'child',
        }),
      }),
    );
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty(
      'movementStatus',
    );
  });

  it('acknowledges each bulk location by its device point id', async () => {
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
      location: {
        create: jest.fn().mockResolvedValue({ id: 'stored-1' }),
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'stored-2' }),
      },
    };
    const service = new LocationsService(prisma, {} as any, {} as any);
    jest
      .spyOn(service, 'recordLocation')
      .mockResolvedValue({ id: 'stored-1' } as any);
    const result = await service.recordBulkLocations('u1', {
      locations: [
        {
          latitude: 41,
          longitude: 29,
          measuredAt: '2026-09-09T10:00:00.000Z',
          devicePointId: 'point-1',
        },
        {
          latitude: 41.1,
          longitude: 29.1,
          measuredAt: '2026-09-09T10:01:00.000Z',
          devicePointId: 'point-2',
        },
      ],
    });

    expect(result.acceptedIds).toEqual(['point-1']);
    expect(result.duplicateIds).toEqual(['point-2']);
    expect(result.rejectedItems).toEqual([]);
    expect(result.count).toBe(2);
  });

  it('keeps an invalid bulk item out of the acknowledgement lists', async () => {
    const prisma: any = {
      user: { findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
      location: { create: jest.fn(), findUnique: jest.fn() },
    };
    const service = new LocationsService(prisma, {} as any, {} as any);
    const result = await service.recordBulkLocations('u1', {
      locations: [
        {
          latitude: 41,
          longitude: 29,
          measuredAt: '2026-09-09T10:00:00.000Z',
        },
      ],
    });

    expect(result.acceptedIds).toEqual([]);
    expect(result.duplicateIds).toEqual([]);
    expect(result.rejectedItems).toEqual([
      { devicePointId: '', reason: 'missing_device_point_id' },
    ]);
  });

  it('disconnects a WebSocket client with an invalid token', async () => {
    const jwt = {
      verify: jest.fn().mockImplementation(() => {
        throw new Error('invalid');
      }),
    };
    const gateway = new LocationsGateway({} as any, jwt as any);
    const client: any = {
      id: 'socket-1',
      data: {},
      handshake: { auth: { token: 'Bearer bad' }, headers: {}, query: {} },
      disconnect: jest.fn(),
    };
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a WebSocket client whose session was revoked', async () => {
    const prisma: any = {
      session: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const jwt = {
      verify: jest
        .fn()
        .mockReturnValue({ sub: 'u1', sid: 's1', typ: 'access' }),
    };
    const gateway = new LocationsGateway(prisma, jwt as any);
    const client: any = {
      id: 'socket-1',
      data: {},
      handshake: { auth: { token: 'Bearer token' }, headers: {}, query: {} },
      disconnect: jest.fn(),
    };
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('prevents a WebSocket user from joining another family room', async () => {
    const prisma: any = {
      familyMember: { findUnique: jest.fn().mockResolvedValue(null) },
    };
    const gateway = new LocationsGateway(prisma, {} as any);
    const client: any = {
      id: 'socket-1',
      data: { userId: 'u1' },
      join: jest.fn(),
    };
    const result = await gateway.handleJoinFamily(
      { familyId: 'other-family' },
      client,
    );
    expect(result.status).toBe('error');
    expect(client.join).not.toHaveBeenCalled();
  });

  it('revokes every active socket from only the requested family room', async () => {
    const gateway = new LocationsGateway({} as any, {} as any);
    const first = { leave: jest.fn().mockResolvedValue(undefined) };
    const second = { leave: jest.fn().mockResolvedValue(undefined) };
    gateway.server = {
      sockets: { sockets: new Map([['socket-1', first], ['socket-2', second]]) },
    } as any;
    (gateway as any).activeUsers.set('u1', new Set(['socket-1', 'socket-2']));

    await gateway.revokeFamilyAccess('u1', 'family-a');

    expect(first.leave).toHaveBeenCalledWith('family_family-a');
    expect(second.leave).toHaveBeenCalledWith('family_family-a');
  });

  it('logs a socket room-revocation failure without closing the socket', async () => {
    const gateway = new LocationsGateway({} as any, {} as any);
    const leave = jest.fn().mockRejectedValue(new Error('adapter unavailable'));
    gateway.server = { sockets: { sockets: new Map([['socket-1', { leave }]]) } } as any;
    (gateway as any).activeUsers.set('u1', new Set(['socket-1']));
    const logError = jest.spyOn((gateway as any).logger, 'error');

    await expect(gateway.revokeFamilyAccess('u1', 'family-a')).resolves.toBeUndefined();

    expect(logError).toHaveBeenCalled();
  });
});
