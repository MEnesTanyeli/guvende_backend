import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { randomUUID } from 'crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { LocationsGateway } from '../src/locations/locations.gateway';
import { validateTestDatabaseEnvironment } from '../src/testing/test-database-safety';

const USER_ID = '00000000-0000-4000-8000-0000000005a1';
const GUARDIAN_A_ID = '00000000-0000-4000-8000-0000000005a2';
const GUARDIAN_B_ID = '00000000-0000-4000-8000-0000000005a3';
const FAMILY_A_ID = '00000000-0000-4000-8000-0000000005f1';
const FAMILY_B_ID = '00000000-0000-4000-8000-0000000005f2';
const IDS = [USER_ID, GUARDIAN_A_ID, GUARDIAN_B_ID];
const PASSWORD = 'Online-SOS-E2E-2026';

describe('Online SOS cooldown and idempotency E2E', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let token: string;
  let pushSpy: jest.SpyInstance;
  let locationSocketSpy: jest.SpyInstance;

  async function assertSafeDatabase() {
    validateTestDatabaseEnvironment(process.env);
    const result = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    if (result[0]?.database !== 'guvende_test') {
      throw new Error(
        'Online SOS E2E fixture islemi guvende_test disinda reddedildi.',
      );
    }
  }

  async function cleanup() {
    await assertSafeDatabase();
    await prisma.user.deleteMany({ where: { id: { in: IDS } } });
  }

  function postSos(eventId: string, accessToken = token) {
    return request(app.getHttpServer())
      .post('/sos')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ eventId, latitude: 39.8468, longitude: 33.5153 });
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
    await assertSafeDatabase();

    pushSpy = jest
      .spyOn(app.get(NotificationsService), 'sendOneSignalNotification')
      .mockResolvedValue(undefined);
    locationSocketSpy = jest
      .spyOn(app.get(LocationsGateway), 'sendLocationUpdate')
      .mockResolvedValue(undefined);
  });

  beforeEach(async () => {
    await cleanup();
    pushSpy.mockClear();
    locationSocketSpy.mockClear();
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const trialEndsAt = new Date(Date.now() + 86_400_000);
    await prisma.user.createMany({
      data: [
        {
          id: USER_ID,
          name: 'SOS Child',
          email: 'sos-child@guvende.test',
          passwordHash,
          role: 'child',
          trialEndsAt,
        },
        {
          id: GUARDIAN_A_ID,
          name: 'Muted Guardian',
          email: 'sos-guardian-a@guvende.test',
          passwordHash,
          role: 'guardian',
          trialEndsAt,
        },
        {
          id: GUARDIAN_B_ID,
          name: 'Guardian B',
          email: 'sos-guardian-b@guvende.test',
          passwordHash,
          role: 'guardian',
          trialEndsAt,
        },
      ],
    });
    await prisma.family.createMany({
      data: [
        { id: FAMILY_A_ID, name: 'SOS Family A', ownerId: GUARDIAN_A_ID },
        { id: FAMILY_B_ID, name: 'SOS Family B', ownerId: GUARDIAN_B_ID },
      ],
    });
    await prisma.familyMember.createMany({
      data: [
        { familyId: FAMILY_A_ID, userId: USER_ID, memberType: 'child' },
        {
          familyId: FAMILY_A_ID,
          userId: GUARDIAN_A_ID,
          memberType: 'guardian',
          muteNotifications: true,
        },
        { familyId: FAMILY_B_ID, userId: USER_ID, memberType: 'child' },
        {
          familyId: FAMILY_B_ID,
          userId: GUARDIAN_B_ID,
          memberType: 'guardian',
        },
      ],
    });
    const login = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'sos-child@guvende.test',
        password: PASSWORD,
        deviceId: 'sos-e2e-device',
      })
      .expect(201);
    token = login.body.accessToken;
  });

  afterEach(cleanup);

  afterAll(async () => {
    if (app) await app.close();
  });

  it('commits one SOS and Alert per family, then notifies muted and normal guardians', async () => {
    const eventId = randomUUID();
    const response = await postSos(eventId).expect(201);

    expect(response.body).toMatchObject({ idempotent: false });
    expect(response.body.events).toHaveLength(2);
    expect(
      await prisma.sosEvent.count({ where: { userId: USER_ID, eventId } }),
    ).toBe(2);
    expect(
      await prisma.alert.count({ where: { userId: USER_ID, type: 'sos' } }),
    ).toBe(2);
    expect(pushSpy).toHaveBeenCalledTimes(2);
    expect(pushSpy.mock.calls.flatMap((call) => call[0])).toEqual(
      expect.arrayContaining([GUARDIAN_A_ID, GUARDIAN_B_ID]),
    );
    expect(locationSocketSpy).toHaveBeenCalledTimes(2);
  });

  it('treats a repeated eventId as success without duplicate DB or delivery effects', async () => {
    const eventId = randomUUID();
    await postSos(eventId).expect(201);
    pushSpy.mockClear();
    locationSocketSpy.mockClear();

    const retry = await postSos(eventId).expect(201);
    expect(retry.body.idempotent).toBe(true);
    expect(
      await prisma.sosEvent.count({ where: { userId: USER_ID, eventId } }),
    ).toBe(2);
    expect(
      await prisma.alert.count({ where: { userId: USER_ID, type: 'sos' } }),
    ).toBe(2);
    expect(pushSpy).not.toHaveBeenCalled();
    expect(locationSocketSpy).not.toHaveBeenCalled();
  });

  it('serializes concurrent duplicate requests and creates only one family set', async () => {
    const eventId = randomUUID();
    const [first, second] = await Promise.all([
      postSos(eventId),
      postSos(eventId),
    ]);

    expect([first.status, second.status]).toEqual([201, 201]);
    expect([first.body.idempotent, second.body.idempotent].sort()).toEqual([
      false,
      true,
    ]);
    expect(
      await prisma.sosEvent.count({ where: { userId: USER_ID, eventId } }),
    ).toBe(2);
    expect(
      await prisma.alert.count({ where: { userId: USER_ID, type: 'sos' } }),
    ).toBe(2);
    expect(pushSpy).toHaveBeenCalledTimes(2);
    expect(locationSocketSpy).toHaveBeenCalledTimes(2);
  });

  it('rejects a new event during cooldown and accepts it after cooldown', async () => {
    await postSos(randomUUID()).expect(201);
    const blockedId = randomUUID();
    const blocked = await postSos(blockedId).expect(429);
    expect(blocked.body).toMatchObject({
      code: 'SOS_COOLDOWN_ACTIVE',
      retryAfterSeconds: expect.any(Number),
    });
    expect(await prisma.sosEvent.count({ where: { eventId: blockedId } })).toBe(
      0,
    );

    await assertSafeDatabase();
    await prisma.sosEvent.updateMany({
      where: { userId: USER_ID },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
    await postSos(blockedId).expect(201);
    expect(await prisma.sosEvent.count({ where: { eventId: blockedId } })).toBe(
      2,
    );
  });

  it('validates authentication/eventId and keeps committed SOS when delivery fails', async () => {
    await request(app.getHttpServer())
      .post('/sos')
      .send({ eventId: randomUUID(), latitude: 39, longitude: 33 })
      .expect(401);
    await postSos('not-a-uuid').expect(400);
    await request(app.getHttpServer())
      .post('/sos')
      .set('Authorization', `Bearer ${token}`)
      .send({
        eventId: randomUUID(),
        latitude: 39,
        longitude: 33,
        familyId: '00000000-0000-4000-8000-000000000999',
      })
      .expect(400);

    pushSpy.mockRejectedValueOnce(new Error('simulated provider failure'));
    const eventId = randomUUID();
    await postSos(eventId).expect(201);
    expect(await prisma.sosEvent.count({ where: { eventId } })).toBe(2);
    expect(
      await prisma.alert.count({ where: { userId: USER_ID, type: 'sos' } }),
    ).toBe(2);
  });
});
