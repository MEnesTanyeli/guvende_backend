import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { LocationsGateway } from '../src/locations/locations.gateway';
import { validateTestDatabaseEnvironment } from '../src/testing/test-database-safety';
import { LocationRateLimitService } from '../src/locations/location-rate-limit.service';

const USER_ID = '00000000-0000-4000-8000-0000000007a1';
const OWNER_ID = '00000000-0000-4000-8000-0000000007a2';
const FAMILY_ID = '00000000-0000-4000-8000-0000000007f1';
const ZONE_ID = '00000000-0000-4000-8000-0000000007e1';

describe('Bulk Location request-size protection E2E', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let broadcastSpy: jest.SpyInstance;
  let notificationSpy: jest.SpyInstance;
  let locationRateLimit: LocationRateLimitService;

  async function assertSafeDatabase() {
    validateTestDatabaseEnvironment(process.env);
    const db = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    if (db[0]?.database !== 'guvende_test') {
      throw new Error('Bulk Location E2E guvende_test disinda reddedildi.');
    }
  }

  async function cleanup() {
    await assertSafeDatabase();
    await prisma.user.deleteMany({
      where: { id: { in: [USER_ID, OWNER_ID] } },
    });
  }

  function points(count: number, prefix = 'bulk-limit') {
    const start = Date.now() - Math.max(20_000, count * 20);
    return Array.from({ length: count }, (_, index) => ({
      latitude: 39.8468,
      longitude: 33.5153,
      accuracy: 5,
      measuredAt: new Date(start + index * 20).toISOString(),
      devicePointId: `${prefix}-${index}`,
    }));
  }

  function compactPoints(count: number) {
    return Array.from({ length: count }, () => ({
      latitude: 1,
      longitude: 1,
    }));
  }

  function post(
    locations: Array<Record<string, unknown>>,
    accessToken = token,
  ) {
    return request(app.getHttpServer())
      .post('/locations/bulk')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ locations });
  }

  beforeAll(async () => {
    validateTestDatabaseEnvironment(process.env);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    locationRateLimit = app.get(LocationRateLimitService);
    await assertSafeDatabase();
    broadcastSpy = jest
      .spyOn(app.get(LocationsGateway), 'sendLocationUpdate')
      .mockResolvedValue(undefined);
    notificationSpy = jest
      .spyOn(app.get(NotificationsService), 'sendFamilyNotification')
      .mockResolvedValue({ success: true, recipientsCount: 1 });
  });

  beforeEach(async () => {
    locationRateLimit.resetForTests();
    await cleanup();
    broadcastSpy.mockClear();
    notificationSpy.mockClear();
    const trialEndsAt = new Date(Date.now() + 86_400_000);
    await prisma.user.createMany({
      data: [
        {
          id: USER_ID,
          name: 'Bulk Child',
          email: 'bulk-child@guvende.test',
          passwordHash: 'unused',
          role: 'child',
          trialEndsAt,
        },
        {
          id: OWNER_ID,
          name: 'Bulk Owner',
          email: 'bulk-owner@guvende.test',
          passwordHash: 'unused',
          role: 'guardian',
          trialEndsAt,
        },
      ],
    });
    await prisma.family.create({
      data: { id: FAMILY_ID, name: 'Bulk Family', ownerId: OWNER_ID },
    });
    await prisma.familyMember.createMany({
      data: [
        { familyId: FAMILY_ID, userId: USER_ID, memberType: 'child' },
        { familyId: FAMILY_ID, userId: OWNER_ID, memberType: 'guardian' },
      ],
    });
    await prisma.safeZone.create({
      data: {
        id: ZONE_ID,
        familyId: FAMILY_ID,
        createdBy: OWNER_ID,
        name: 'Bulk Zone',
        latitude: 39.8468,
        longitude: 33.5153,
        radius: 100,
        createdAt: new Date(Date.now() - 60_000),
      },
    });
    const session = await prisma.session.create({
      data: {
        userId: USER_ID,
        tokenFamilyId: randomUUID(),
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    token = app.get(JwtService).sign({
      sub: USER_ID,
      email: 'bulk-child@guvende.test',
      sid: session.id,
      typ: 'access',
    });
  });

  afterEach(cleanup);
  afterAll(async () => {
    if (app) await app.close();
  });

  it.each([1, 25])(
    'accepts and stores a valid %i-point batch',
    async (count) => {
      const response = await post(points(count)).expect(201);
      expect(response.body.count).toBe(count);
      expect(await prisma.location.count({ where: { userId: USER_ID } })).toBe(
        count,
      );
    },
  );

  it('accepts all 250 points through the normal location pipeline', async () => {
    const startedAt = Date.now();
    const response = await post(points(250)).expect(201);
    const durationMs = Date.now() - startedAt;

    expect(response.body.count).toBe(250);
    expect(response.body.acceptedIds).toHaveLength(250);
    expect(await prisma.location.count({ where: { userId: USER_ID } })).toBe(
      250,
    );
    expect(broadcastSpy).toHaveBeenCalledTimes(250);
    expect(durationMs).toBeGreaterThanOrEqual(0);
  }, 30_000);

  it.each([251, 1000])(
    'rejects an oversized %i-point batch with no side effects',
    async (count) => {
      const payload = count === 1000 ? compactPoints(count) : points(count);
      const response = await post(payload).expect(400);
      expect(JSON.stringify(response.body.message)).toContain('en fazla 250');
      expect(await prisma.location.count({ where: { userId: USER_ID } })).toBe(
        0,
      );
      expect(
        await prisma.geofenceState.count({ where: { userId: USER_ID } }),
      ).toBe(0);
      expect(await prisma.alert.count({ where: { userId: USER_ID } })).toBe(0);
      expect(notificationSpy).not.toHaveBeenCalled();
      expect(broadcastSpy).not.toHaveBeenCalled();
    },
  );

  it('keeps nested DTO validation atomic', async () => {
    const batch = points(2);
    batch[1].latitude = 91;
    await post(batch).expect(400);
    expect(await prisma.location.count({ where: { userId: USER_ID } })).toBe(0);
  });

  it('rejects an over-budget bulk atomically with the Location 429 contract', async () => {
    locationRateLimit.reserve(USER_ID, 500);
    broadcastSpy.mockClear();
    notificationSpy.mockClear();
    const before = {
      locations: await prisma.location.count({ where: { userId: USER_ID } }),
      states: await prisma.geofenceState.count({ where: { userId: USER_ID } }),
      alerts: await prisma.alert.count({ where: { userId: USER_ID } }),
    };

    const blocked = await post(points(25, 'budget-blocked')).expect(429);
    expect(blocked.body).toMatchObject({
      statusCode: 429,
      code: 'LOCATION_RATE_LIMIT_ACTIVE',
      retryAfterSeconds: expect.any(Number),
    });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    expect(await prisma.location.count({ where: { userId: USER_ID } })).toBe(
      before.locations,
    );
    expect(
      await prisma.geofenceState.count({ where: { userId: USER_ID } }),
    ).toBe(before.states);
    expect(await prisma.alert.count({ where: { userId: USER_ID } })).toBe(
      before.alerts,
    );
    expect(notificationSpy).not.toHaveBeenCalled();
    expect(broadcastSpy).not.toHaveBeenCalled();

    const secondSession = await prisma.session.create({
      data: {
        userId: USER_ID,
        tokenFamilyId: randomUUID(),
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    const secondToken = app.get(JwtService).sign({
      sub: USER_ID,
      email: 'bulk-child@guvende.test',
      sid: secondSession.id,
      typ: 'access',
    });
    await request(app.getHttpServer())
      .post('/locations/bulk')
      .set('Authorization', `Bearer ${secondToken}`)
      .set('X-Forwarded-For', '198.51.100.42')
      .send({ locations: points(1, 'second-session') })
      .expect(429);
  }, 30_000);

  it('atomically limits three concurrent 250-point requests to the 500-point burst', async () => {
    const responses = await Promise.all([
      post(points(250, 'parallel-a')),
      post(points(250, 'parallel-b')),
      post(points(250, 'parallel-c')),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 201, 429,
    ]);
    expect(await prisma.location.count({ where: { userId: USER_ID } })).toBe(
      500,
    );
  }, 30_000);

  it('requires authentication and rejects client-controlled identity fields', async () => {
    await request(app.getHttpServer())
      .post('/locations/bulk')
      .send({ locations: points(1) })
      .expect(401);
    await request(app.getHttpServer())
      .post('/locations/bulk')
      .set('Authorization', `Bearer ${token}`)
      .send({
        locations: points(1),
        userId: OWNER_ID,
        familyId: FAMILY_ID,
        memberId: OWNER_ID,
      })
      .expect(400);
    expect(await prisma.location.count({ where: { userId: USER_ID } })).toBe(0);
    expect(await prisma.location.count({ where: { userId: OWNER_ID } })).toBe(
      0,
    );
  });
});
