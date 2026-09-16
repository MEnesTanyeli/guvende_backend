import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LocationsService } from './locations.service';

describe('Guardian route reset', () => {
  const setup = (role: string | null = 'guardian', target: any = { memberType: 'child' }) => {
    const prisma: any = {
      familyMember: { findUnique: jest.fn().mockResolvedValueOnce(role ? { memberType: role } : null).mockResolvedValueOnce(target) },
      location: { deleteMany: jest.fn().mockResolvedValue({ count: 5 }) },
    };
    return { prisma, service: new LocationsService(prisma, {} as any, {} as any) };
  };
  it.each(['child', 'elder', null])('denies non-guardian %s without deleting', async role => {
    const { service, prisma } = setup(role);
    await expect(service.deleteTodayLocations('actor', 'family', 'target', '2026-01-03')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.location.deleteMany).not.toHaveBeenCalled();
  });
  it('denies targets outside the family', async () => {
    const { service, prisma } = setup('guardian', null);
    await expect(service.deleteTodayLocations('actor', 'family', 'target', '2026-01-03')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.location.deleteMany).not.toHaveBeenCalled();
  });
  it('denies an untracked guardian target', async () => {
    const { service } = setup('guardian', { memberType: 'guardian', guardianTrackingEnabled: false });
    await expect(service.deleteTodayLocations('actor', 'family', 'target', '2026-01-03')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it.each(['', '2026-02-30', '2026-13-01', '01-03-2026', '2999-01-01'])('rejects invalid date %s without falling back to today', async date => {
    const { service, prisma } = setup();
    await expect(service.deleteTodayLocations('actor', 'family', 'target', date)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.location.deleteMany).not.toHaveBeenCalled();
  });
  it('deletes only the target and the Istanbul calendar day, including invalid route points', async () => {
    const { service, prisma } = setup();
    await expect(service.deleteTodayLocations('actor', 'family', 'target', '2026-01-03')).resolves.toEqual({ count: 5, date: '2026-01-03', timezone: 'Europe/Istanbul' });
    expect(prisma.location.deleteMany).toHaveBeenCalledWith({ where: { userId: 'target', recordedAt: {
      gte: new Date('2026-01-02T21:00:00.000Z'), lte: new Date('2026-01-03T20:59:59.999Z'),
    } } });
  });
});
