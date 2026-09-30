import { saveLocationWithGeofences, confirmedZoneName } from './geofence-store';
import { LocationsService } from './locations.service';
import { emptyGeofenceMemory } from './geofence-engine';

const startedAt = new Date('2026-09-01T00:00:00Z');
const zone = {
  id: 'zone-a',
  familyId: 'family-a',
  name: 'Ev',
  latitude: 0,
  longitude: 0,
  radius: 50,
  createdAt: startedAt,
};
const dto = (meters: number, index: number, accuracy = 5) => ({
  latitude: ((meters / 6371000) * 180) / Math.PI,
  longitude: 0,
  accuracy,
  measuredAt: new Date(
    startedAt.getTime() + 60_000 + index * 5000,
  ).toISOString(),
  devicePointId: `point-${index}`,
});

function setup(zones = [zone]) {
  const states = new Map<string, any>();
  const rows: any[] = [],
    alerts: any[] = [];
  const members = [
    {
      familyId: 'family-a',
      memberType: 'child',
      guardianTrackingEnabled: false,
    },
  ];
  const query = ({ where, take }: any) =>
    rows
      .filter(
        (row) =>
          row.userId === where.userId &&
          (!where.recordedAt?.lt || row.recordedAt < where.recordedAt.lt) &&
          (!where.recordedAt?.gt || row.recordedAt > where.recordedAt.gt) &&
          (!where.recordedAt?.lte || row.recordedAt <= where.recordedAt.lte) &&
          (!where.recordedAt?.gte || row.recordedAt >= where.recordedAt.gte),
      )
      .sort((a, b) => b.recordedAt - a.recordedAt)
      .slice(0, take ?? rows.length);
  const key = (where: any) =>
    `${where.userId_safeZoneId.userId}:${where.userId_safeZoneId.safeZoneId}`;
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([{ locked: 1 }]),
    user: {
      findUnique: jest.fn().mockResolvedValue({ id: 'user', name: 'Test' }),
    },
    familyMember: { findMany: jest.fn(async () => members) },
    safeZone: {
      findMany: jest.fn(async ({ where }) =>
        zones.filter((z) => z.familyId === where.familyId),
      ),
    },
    location: {
      findUnique: jest.fn(
        async ({ where }) =>
          rows.find(
            (row) =>
              row.userId === where.userId_devicePointId.userId &&
              row.devicePointId === where.userId_devicePointId.devicePointId,
          ) ?? null,
      ),
      create: jest.fn(async ({ data }) => {
        const row = { id: `loc-${rows.length}`, ...data };
        rows.push(row);
        return row;
      }),
      findMany: jest.fn(async (args) => query(args)),
      findFirst: jest.fn(async (args) => query(args)[0] ?? null),
    },
    geofenceState: {
      findUnique: jest.fn(async ({ where }) => states.get(key(where)) ?? null),
      upsert: jest.fn(async ({ where, create, update }) => {
        const id = key(where);
        states.set(
          id,
          states.has(id) ? { ...states.get(id), ...update } : create,
        );
        return states.get(id);
      }),
      findFirst: jest.fn(async ({ where }) => {
        const match = [...states.values()].find(
          (s) =>
            s.userId === where.userId &&
            s.status === where.status &&
            zones.some(
              (z) =>
                z.id === s.safeZoneId && z.familyId === where.safeZone.familyId,
            ),
        );
        return match
          ? { ...match, safeZone: zones.find((z) => z.id === match.safeZoneId) }
          : null;
      }),
    },
    alert: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      create: jest.fn(async ({ data }) => {
        const alert = { id: `alert-${alerts.length}`, ...data };
        alerts.push(alert);
        return alert;
      }),
    },
  };
  const prisma: any = {
    ...tx,
    $transaction: jest.fn(async (work: any) => work(tx)),
  };
  const notifications: any = {
    sendFamilyNotification: jest.fn(),
    resolveActiveAlerts: jest.fn(),
  };
  const gateway: any = { sendLocationUpdate: jest.fn() };
  const service = () => new LocationsService(prisma, gateway, notifications);
  const seedInside = (id = 'zone-a', userId = 'user') =>
    states.set(`${userId}:${id}`, {
      ...emptyGeofenceMemory(),
      status: 'inside',
      safeZoneId: id,
      userId,
    });
  return {
    prisma,
    tx,
    rows,
    states,
    alerts,
    notifications,
    gateway,
    service,
    seedInside,
    members,
  };
}

describe('Persistent geofence and location pipeline', () => {
  afterEach(() => jest.restoreAllMocks());

  it('distinguishes network loss during upload from an offline measurement', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(startedAt.getTime() + 90_000);
    const h = setup();
    h.seedInside();
    for (let i = 0; i < 3; i++)
      await h.service().recordLocation('user', {
        ...dto(90, i),
        connectionStatus: 'online',
        deliveryMode: 'deferred',
        deferredReason: 'offline',
      });
    expect(h.alerts[0].metadata).toMatchObject({
      delayedDelivery: true,
      recordedOffline: false,
    });
    expect(h.alerts[0].message).not.toContain('Çevrimdışı');
  });

  it('labels a short offline exit with its measurement time even when confirmation arrives live', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(startedAt.getTime() + 90_000);
    const h = setup();
    h.seedInside();
    await h.service().recordLocation('user', {
      ...dto(70, 0),
      connectionStatus: 'offline',
      deliveryMode: 'deferred',
      deferredReason: 'offline',
    });
    await h.service().recordLocation('user', dto(80, 1));
    await h.service().recordLocation('user', dto(90, 2));
    expect(h.alerts[0].metadata).toMatchObject({
      occurredAt: dto(70, 0).measuredAt,
      confirmedAt: dto(90, 2).measuredAt,
      delayedDelivery: true,
      recordedOffline: true,
    });
    expect(h.alerts[0].message).toContain('01.09.2026 03:01');
    expect(h.alerts[0].message).toContain('Çevrimdışı kaydedildi');
    expect(h.notifications.sendFamilyNotification).toHaveBeenCalledWith(
      'family-a',
      'user',
      expect.any(String),
      expect.any(String),
      expect.objectContaining({
        occurredAt: dto(70, 0).measuredAt,
        recordedOffline: true,
        delayedDelivery: true,
      }),
    );
  });

  it('labels deferred server-error uploads without claiming the device was offline', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(startedAt.getTime() + 90_000);
    const h = setup();
    h.seedInside();
    for (let i = 0; i < 3; i++)
      await h.service().recordLocation('user', {
        ...dto(90, i),
        deliveryMode: 'deferred',
        deferredReason: 'server_error',
        connectionStatus: 'online',
      });
    expect(h.alerts[0].metadata).toMatchObject({
      delayedDelivery: true,
      recordedOffline: false,
    });
    expect(h.alerts[0].message).toContain('gecikmeli');
    expect(h.alerts[0].message).not.toContain('Çevrimdışı');
  });

  it('does not label a fresh live exit as delayed', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(startedAt.getTime() + 90_000);
    const h = setup();
    h.seedInside();
    for (let i = 0; i < 3; i++)
      await h.service().recordLocation('user', dto(90, i));
    expect(h.alerts[0].metadata).toMatchObject({
      delayedDelivery: false,
      recordedOffline: false,
    });
    expect(h.alerts[0].message).not.toContain('gecikmeli');
  });
  it('does not generate events from points measured before a zone existed', async () => {
    const h = setup([
      { ...zone, createdAt: new Date(startedAt.getTime() + 600_000) },
    ]);
    h.seedInside();
    for (let i = 0; i < 3; i++)
      await h.service().recordLocation('user', dto(90, i));
    expect(h.alerts).toHaveLength(0);
    expect(h.states.get('user:zone-a').status).toBe('inside');
  });
  it('does not let an active exit for one zone suppress another zone in the same family', async () => {
    const h = setup([zone, { ...zone, id: 'zone-b', name: 'Okul' }]);
    h.seedInside();
    h.seedInside('zone-b');
    for (let i = 0; i < 3; i++)
      await h.service().recordLocation('user', dto(90, i));
    expect(h.alerts.map((a) => a.metadata.safeZoneId)).toEqual([
      'zone-a',
      'zone-b',
    ]);
    expect(h.notifications.sendFamilyNotification).toHaveBeenCalledTimes(2);
  });
  it('preserves evidence across service restarts and creates only one exit', async () => {
    const h = setup();
    h.seedInside();
    await h.service().recordLocation('user', dto(70, 0));
    await h.service().recordLocation('user', dto(80, 1));
    expect(h.alerts).toHaveLength(0);
    await h.service().recordLocation('user', dto(90, 2));
    await h.service().recordLocation('user', dto(100, 3));
    expect(h.alerts.map((a) => a.type)).toEqual(['safe_zone_exit']);
    expect(h.notifications.sendFamilyNotification).toHaveBeenCalledTimes(1);
    expect(h.tx.$queryRaw).toHaveBeenCalledTimes(4);
  });
  it('processes every bulk point chronologically, including a middle-of-batch exit and re-entry', async () => {
    const h = setup();
    h.seedInside();
    const points = [40, 55, 70, 80, 90, 100, 30, 30, 30].map((m, i) =>
      dto(m, i),
    );
    const result = await h
      .service()
      .recordBulkLocations('user', { locations: [...points].reverse() });
    expect(result.acceptedIds).toEqual(points.map((p) => p.devicePointId));
    expect(h.alerts.map((a) => a.type)).toEqual([
      'safe_zone_exit',
      'safe_zone_enter',
    ]);
    expect(h.notifications.sendFamilyNotification).toHaveBeenCalledTimes(2);
    expect(h.alerts.every((a) => a.metadata.delayedDelivery)).toBe(true);
  });
  it('does not bypass drift protection for old/offline measurements', async () => {
    const h = setup();
    h.seedInside();
    await h.service().recordBulkLocations('user', {
      locations: [40, 90, 40].map((m, i) => dto(m, i)),
    });
    expect(h.alerts).toHaveLength(0);
  });
  it('does not count duplicate points again or repeat alerts on retry', async () => {
    const h = setup();
    h.seedInside();
    const locations = [70, 80, 90].map((m, i) => dto(m, i));
    await h.service().recordBulkLocations('user', { locations });
    const result = await h.service().recordBulkLocations('user', { locations });
    await h.service().recordLocation('user', locations[2]);
    expect(result.duplicateIds).toEqual(locations.map((p) => p.devicePointId));
    expect(h.rows).toHaveLength(3);
    expect(h.alerts).toHaveLength(1);
  });
  it('records late points without rewinding the confirmed state or broadcasting an old position', async () => {
    const h = setup();
    h.seedInside();
    for (const [i, m] of [70, 80, 90].entries())
      await h.service().recordLocation('user', dto(m, i + 10));
    h.gateway.sendLocationUpdate.mockClear();
    for (let i = 0; i < 3; i++)
      await h.service().recordLocation('user', dto(30, i));
    expect(h.rows).toHaveLength(6);
    expect(h.states.get('user:zone-a').status).toBe('outside');
    expect(h.alerts).toHaveLength(1);
    expect(h.gateway.sendLocationUpdate).not.toHaveBeenCalled();
  });
  it('keeps inside labels during unconfirmed excursions for both REST and websocket', async () => {
    const h = setup();
    h.seedInside();
    await h.service().recordLocation('user', dto(90, 0));
    expect(await confirmedZoneName(h.prisma, 'user', 'family-a')).toBe('Ev');
    expect(h.gateway.sendLocationUpdate).toHaveBeenLastCalledWith(
      'family-a',
      expect.objectContaining({ insideZoneName: 'Ev' }),
    );
    await h.service().recordLocation('user', dto(90, 1));
    await h.service().recordLocation('user', dto(90, 2));
    expect(await confirmedZoneName(h.prisma, 'user', 'family-a')).toBeNull();
  });
  it('ignores untrusted client zone labels', async () => {
    const h = setup();
    h.seedInside();
    for (let i = 0; i < 3; i++)
      await h.service().recordLocation('user', {
        ...dto(90, i),
        insideZoneId: zone.id,
        insideZoneName: zone.name,
      });
    expect(h.alerts.map((a) => a.type)).toEqual(['safe_zone_exit']);
  });
  it('isolates overlapping zones, families and users', async () => {
    const h = setup([zone, { ...zone, id: 'zone-b', familyId: 'family-b' }]);
    h.members.push({
      familyId: 'family-b',
      memberType: 'child',
      guardianTrackingEnabled: false,
    });
    h.seedInside();
    h.seedInside('zone-b');
    h.seedInside('zone-a', 'other');
    for (let i = 0; i < 3; i++)
      await h.service().recordLocation('user', dto(90, i));
    expect(h.alerts.map((a) => a.familyId)).toEqual(['family-a', 'family-b']);
    expect(h.states.get('other:zone-a').status).toBe('inside');
    expect(h.tx.alert.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          familyId: 'family-a',
          metadata: { path: ['safeZoneId'], equals: 'zone-a' },
        }),
      }),
    );
  });
  it('warms up new persistent state from history without sending historical entry alerts', async () => {
    const h = setup();
    for (let i = 0; i < 3; i++)
      h.rows.push({
        ...dto(30, i),
        userId: 'user',
        recordedAt: new Date(dto(30, i).measuredAt),
      });
    for (let i = 3; i < 6; i++)
      await h.service().recordLocation('user', dto(90, i));
    expect(h.alerts.map((a) => a.type)).toEqual(['safe_zone_exit']);
  });
  it('stops a bulk batch at a storage failure so later points cannot overtake the retry', async () => {
    const h = setup();
    h.seedInside();
    const instance = h.service();
    const record = jest
      .spyOn(instance, 'recordLocation')
      .mockRejectedValueOnce(new Error('database unavailable'));
    const result = await instance.recordBulkLocations('user', {
      locations: [dto(70, 0), dto(80, 1), dto(90, 2)],
    });
    expect(record).toHaveBeenCalledTimes(1);
    expect(result.acceptedIds).toEqual([]);
    expect(result.rejectedItems).toEqual([
      { devicePointId: 'point-0', reason: 'storage_error' },
    ]);
  });
  it('rolls errors back through the transaction instead of acknowledging a partial event', async () => {
    const h = setup();
    h.seedInside();
    await saveLocationWithGeofences(h.prisma, 'user', dto(70, 0));
    await saveLocationWithGeofences(h.prisma, 'user', dto(80, 1));
    h.tx.alert.create.mockRejectedValueOnce(new Error('write failed'));
    await expect(
      saveLocationWithGeofences(h.prisma, 'user', dto(90, 2)),
    ).rejects.toThrow('write failed');
    // The callback rejection is what instructs Prisma to roll back; this double has no SQL engine.
    expect(h.prisma.$transaction).toHaveBeenCalled();
  });
});
