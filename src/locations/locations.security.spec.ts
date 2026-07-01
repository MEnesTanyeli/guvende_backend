import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { MemberType } from '@prisma/client';
import { LocationsService } from './locations.service';
import { LocationsGateway } from './locations.gateway';

describe('Location and WebSocket isolation', () => {
  it('rejects latest-location access from a non-member', async () => {
    const prisma: any = { familyMember: { findUnique: jest.fn().mockResolvedValue(null) } };
    const service = new LocationsService(prisma, {} as any, {} as any);
    await expect(service.getLatestLocations('attacker', 'family-1')).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a child to see only their own latest location', async () => {
    const ownLocation = { id: 'l1', userId: 'child', latitude: 1, longitude: 1 };
    const prisma: any = {
      familyMember: { findUnique: jest.fn().mockResolvedValue({ memberType: MemberType.child }) },
      safeZone: { findMany: jest.fn().mockResolvedValue([]) },
      location: { findFirst: jest.fn().mockResolvedValue(ownLocation) },
    };
    const service = new LocationsService(prisma, {} as any, {} as any);
    await expect(service.getLatestLocations('child', 'family-1')).resolves.toEqual([{ ...ownLocation, insideZoneName: null }]);
    expect(prisma.location.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 'child' } }));
  });

  it('rejects history access when the target is not in the family', async () => {
    const prisma: any = { familyMember: { findUnique: jest.fn()
      .mockResolvedValueOnce({ memberType: MemberType.guardian })
      .mockResolvedValueOnce(null) } };
    const service = new LocationsService(prisma, {} as any, {} as any);
    await expect(service.getLocationsHistory('guardian', 'family-1', 'outsider')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('disconnects a WebSocket client with an invalid token', async () => {
    const jwt = { verify: jest.fn().mockImplementation(() => { throw new Error('invalid'); }) };
    const gateway = new LocationsGateway({} as any, jwt as any);
    const client: any = {
      id: 'socket-1', data: {}, handshake: { auth: { token: 'Bearer bad' }, headers: {}, query: {} },
      disconnect: jest.fn(),
    };
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('disconnects a WebSocket client whose session was revoked', async () => {
    const prisma: any = { session: { findFirst: jest.fn().mockResolvedValue(null) } };
    const jwt = { verify: jest.fn().mockReturnValue({ sub: 'u1', sid: 's1', typ: 'access' }) };
    const gateway = new LocationsGateway(prisma, jwt as any);
    const client: any = {
      id: 'socket-1', data: {}, handshake: { auth: { token: 'Bearer token' }, headers: {}, query: {} },
      disconnect: jest.fn(),
    };
    await gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('prevents a WebSocket user from joining another family room', async () => {
    const prisma: any = { familyMember: { findUnique: jest.fn().mockResolvedValue(null) } };
    const gateway = new LocationsGateway(prisma, {} as any);
    const client: any = { id: 'socket-1', data: { userId: 'u1' }, join: jest.fn() };
    const result = await gateway.handleJoinFamily({ familyId: 'other-family' }, client);
    expect(result.status).toBe('error');
    expect(client.join).not.toHaveBeenCalled();
  });
});
