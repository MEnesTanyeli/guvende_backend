import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { MemberType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { validateTestDatabaseEnvironment } from '../src/testing/test-database-safety';

const PASSWORD = 'Proxy-Authorization-E2E-Password-2026';
const FAMILIES = {
  anne: '20000000-0000-4000-8000-000000000001',
  guardianB: '20000000-0000-4000-8000-000000000002',
  ayse: '20000000-0000-4000-8000-000000000003',
} as const;
const USERS = {
  anne: {
    id: '20000000-0000-4000-8000-000000000011',
    email: 'proxy-anne@guvende.test',
    role: 'guardian',
  },
  baba: {
    id: '20000000-0000-4000-8000-000000000012',
    email: 'proxy-baba@guvende.test',
    role: 'guardian',
  },
  dede: {
    id: '20000000-0000-4000-8000-000000000013',
    email: 'proxy-dede@guvende.test',
    role: 'guardian',
  },
  ayse: {
    id: '20000000-0000-4000-8000-000000000014',
    email: 'proxy-ayse@guvende.test',
    role: 'guardian',
  },
  childA: {
    id: '20000000-0000-4000-8000-000000000015',
    email: 'proxy-child-a@guvende.test',
    role: 'child',
  },
  elderA: {
    id: '20000000-0000-4000-8000-000000000016',
    email: 'proxy-elder-a@guvende.test',
    role: 'elder',
  },
  guardianB: {
    id: '20000000-0000-4000-8000-000000000017',
    email: 'proxy-guardian-b@guvende.test',
    role: 'guardian',
  },
  childB: {
    id: '20000000-0000-4000-8000-000000000018',
    email: 'proxy-child-b@guvende.test',
    role: 'child',
  },
} as const;
const USER_IDS = Object.values(USERS).map((user) => user.id);
const FAMILY_IDS = Object.values(FAMILIES);
const CHILD_B_MEDICATION = 'Family B Child private medication';

describe('Proxy authorization E2E', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordHash: string;
  let fetchSpy: jest.SpyInstance;
  let loginAttemptId = 0;

  async function assertSafeDatabase(): Promise<void> {
    validateTestDatabaseEnvironment(process.env);
    const database = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    if (database[0]?.database !== 'guvende_test') {
      throw new Error(
        'Proxy E2E fixture islemi reddedildi: hedef guvende_test degil.',
      );
    }
  }

  async function removeFixtures(): Promise<void> {
    await assertSafeDatabase();
    await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } });
  }

  async function login(user: (typeof USERS)[keyof typeof USERS]) {
    loginAttemptId += 1;
    return request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', `198.51.100.${loginAttemptId}`)
      .send({
        email: user.email,
        password: PASSWORD,
        ...(user.role === 'child' || user.role === 'elder'
          ? { deviceId: `proxy-device-${user.id.slice(-2)}` }
          : {}),
      })
      .expect(201);
  }

  async function setProxy(accessToken: string, email: string) {
    return request(app.getHttpServer())
      .post('/users/proxy')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ email });
  }

  async function removeProxy(accessToken: string) {
    return request(app.getHttpServer())
      .patch('/users/proxy/remove')
      .set('Authorization', `Bearer ${accessToken}`);
  }

  async function proxyId(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { proxyId: true },
    });
    return user.proxyId;
  }

  async function hasMembership(familyId: string, userId: string) {
    return !!(await prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId, userId } },
    }));
  }

  function expectRejected(state: Record<string, unknown>) {
    expect(state).toEqual({
      status: 403,
      proxyId: null,
      familyMembershipCreated: false,
    });
  }

  beforeAll(async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => {
      throw new Error('E2E testinde dis ag erisimi engellendi.');
    });
    expect(process.env.BREVO_API_KEY).toBe('');
    expect(process.env.ONESIGNAL_APP_ID).toBe('');
    expect(process.env.ONESIGNAL_REST_API_KEY).toBe('');
    validateTestDatabaseEnvironment(process.env);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await assertSafeDatabase();
    passwordHash = await bcrypt.hash(PASSWORD, 10);
  });

  beforeEach(async () => {
    await removeFixtures();
    const activeTrialEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.user.createMany({
      data: Object.values(USERS).map((user) => ({
        ...user,
        name: user.email.split('@')[0],
        passwordHash,
        trialEndsAt: activeTrialEndsAt,
      })),
    });
    await prisma.family.createMany({
      data: [
        {
          id: FAMILIES.anne,
          name: 'Proxy Anne Family',
          ownerId: USERS.anne.id,
        },
        {
          id: FAMILIES.guardianB,
          name: 'Proxy Guardian B Family',
          ownerId: USERS.guardianB.id,
        },
        {
          id: FAMILIES.ayse,
          name: 'Proxy Ayse Family',
          ownerId: USERS.ayse.id,
        },
      ],
    });
    await prisma.familyMember.createMany({
      data: [
        {
          familyId: FAMILIES.anne,
          userId: USERS.anne.id,
          memberType: MemberType.guardian,
        },
        {
          familyId: FAMILIES.guardianB,
          userId: USERS.guardianB.id,
          memberType: MemberType.guardian,
        },
        {
          familyId: FAMILIES.guardianB,
          userId: USERS.childB.id,
          memberType: MemberType.child,
        },
        {
          familyId: FAMILIES.ayse,
          userId: USERS.ayse.id,
          memberType: MemberType.guardian,
        },
      ],
    });
    await prisma.location.create({
      data: { userId: USERS.childB.id, latitude: 41, longitude: 29 },
    });
    await prisma.appUsage.create({
      data: {
        userId: USERS.childB.id,
        packageName: 'com.example.private',
        appName: 'Private App',
        durationMin: 15,
        recordedDate: new Date(),
      },
    });
    await prisma.medicationReminder.create({
      data: {
        userId: USERS.childB.id,
        medicationName: CHILD_B_MEDICATION,
        dosage: '1 tablet',
        time: '08:00',
      },
    });
  });

  afterEach(async () => {
    await removeFixtures();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockClear();
  });

  afterAll(async () => {
    if (app) await app.close();
    fetchSpy?.mockRestore();
  });

  it('allows a guardian to select another guardian as proxy', async () => {
    const anne = await login(USERS.anne);
    const response = await setProxy(anne.body.accessToken, USERS.baba.email);

    expect(response.status).toBe(201);
    expect(await proxyId(USERS.anne.id)).toBe(USERS.baba.id);
    expect(await hasMembership(FAMILIES.anne, USERS.baba.id)).toBe(true);
  });

  it('rejects a guardian selecting a child from another family and creating tracking access', async () => {
    const anne = await login(USERS.anne);
    const response = await setProxy(anne.body.accessToken, USERS.childB.email);
    const token = anne.body.accessToken as string;
    const locationHistory = await request(app.getHttpServer())
      .get(`/families/${FAMILIES.anne}/locations/history/${USERS.childB.id}`)
      .set('Authorization', `Bearer ${token}`);
    const activity = await request(app.getHttpServer())
      .get(`/activity/daily?memberId=${USERS.childB.id}`)
      .set('Authorization', `Bearer ${token}`);
    const appUsage = await request(app.getHttpServer())
      .get(`/app-usage/member/${USERS.childB.id}`)
      .set('Authorization', `Bearer ${token}`);
    const medications = await request(app.getHttpServer())
      .get(`/medications/user/${USERS.childB.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect({
      status: response.status,
      proxyId: await proxyId(USERS.anne.id),
      familyMembershipCreated: await hasMembership(
        FAMILIES.anne,
        USERS.childB.id,
      ),
      trackingAccessDenied: [403, 404].includes(locationHistory.status),
      remainingTrackingAccess: [
        activity.status,
        appUsage.status,
        medications.status,
      ],
      medicationExposed: JSON.stringify(medications.body).includes(
        CHILD_B_MEDICATION,
      ),
    }).toEqual({
      status: 403,
      proxyId: null,
      familyMembershipCreated: false,
      trackingAccessDenied: true,
      remainingTrackingAccess: [403, 403, 403],
      medicationExposed: false,
    });
  });

  it('rejects a guardian selecting an elder as proxy', async () => {
    const anne = await login(USERS.anne);
    const response = await setProxy(anne.body.accessToken, USERS.elderA.email);

    expectRejected({
      status: response.status,
      proxyId: await proxyId(USERS.anne.id),
      familyMembershipCreated: await hasMembership(
        FAMILIES.anne,
        USERS.elderA.id,
      ),
    });
  });

  it('rejects a child selecting a guardian as proxy', async () => {
    const child = await login(USERS.childA);
    const response = await setProxy(child.body.accessToken, USERS.baba.email);

    expectRejected({
      status: response.status,
      proxyId: await proxyId(USERS.childA.id),
      familyMembershipCreated: await hasMembership(
        FAMILIES.anne,
        USERS.baba.id,
      ),
    });
  });

  it('rejects an elder selecting a guardian as proxy', async () => {
    const elder = await login(USERS.elderA);
    const response = await setProxy(elder.body.accessToken, USERS.baba.email);

    expectRejected({
      status: response.status,
      proxyId: await proxyId(USERS.elderA.id),
      familyMembershipCreated: await hasMembership(
        FAMILIES.anne,
        USERS.baba.id,
      ),
    });
  });

  it('rejects silently replacing an owner existing proxy', async () => {
    const anne = await login(USERS.anne);
    expect(
      (await setProxy(anne.body.accessToken, USERS.baba.email)).status,
    ).toBe(201);
    const response = await setProxy(anne.body.accessToken, USERS.dede.email);

    expect({
      status: response.status,
      proxyId: await proxyId(USERS.anne.id),
      babaMembership: await hasMembership(FAMILIES.anne, USERS.baba.id),
      dedeMembership: await hasMembership(FAMILIES.anne, USERS.dede.id),
    }).toEqual({
      status: 403,
      proxyId: USERS.baba.id,
      babaMembership: true,
      dedeMembership: false,
    });
  });

  it('rejects assigning one guardian as proxy for two owners', async () => {
    const anne = await login(USERS.anne);
    const ayse = await login(USERS.ayse);
    expect(
      (await setProxy(anne.body.accessToken, USERS.baba.email)).status,
    ).toBe(201);
    const response = await setProxy(ayse.body.accessToken, USERS.baba.email);

    expect({
      status: response.status,
      anneProxyId: await proxyId(USERS.anne.id),
      ayseProxyId: await proxyId(USERS.ayse.id),
      ayseMembershipCreated: await hasMembership(FAMILIES.ayse, USERS.baba.id),
    }).toEqual({
      status: 403,
      anneProxyId: USERS.baba.id,
      ayseProxyId: null,
      ayseMembershipCreated: false,
    });
  });

  it('rejects a proxy user selecting another proxy and forming a chain', async () => {
    const anne = await login(USERS.anne);
    const baba = await login(USERS.baba);
    expect(
      (await setProxy(anne.body.accessToken, USERS.baba.email)).status,
    ).toBe(201);
    const response = await setProxy(baba.body.accessToken, USERS.dede.email);

    expect({
      status: response.status,
      babaProxyId: await proxyId(USERS.baba.id),
      anneProxyId: await proxyId(USERS.anne.id),
    }).toEqual({ status: 403, babaProxyId: null, anneProxyId: USERS.baba.id });
  });

  it('rejects making a user with their own proxy another owner proxy', async () => {
    const anne = await login(USERS.anne);
    const baba = await login(USERS.baba);
    expect(
      (await setProxy(baba.body.accessToken, USERS.dede.email)).status,
    ).toBe(201);
    const response = await setProxy(anne.body.accessToken, USERS.baba.email);

    expect({
      status: response.status,
      anneProxyId: await proxyId(USERS.anne.id),
      babaProxyId: await proxyId(USERS.baba.id),
    }).toEqual({ status: 403, anneProxyId: null, babaProxyId: USERS.dede.id });
  });

  it('rejects self proxy', async () => {
    const anne = await login(USERS.anne);
    const response = await setProxy(anne.body.accessToken, USERS.anne.email);

    expectRejected({
      status: response.status,
      proxyId: await proxyId(USERS.anne.id),
      familyMembershipCreated: false,
    });
  });

  it('allows a new proxy after the current proxy is removed', async () => {
    const anne = await login(USERS.anne);
    expect(
      (await setProxy(anne.body.accessToken, USERS.baba.email)).status,
    ).toBe(201);
    expect((await removeProxy(anne.body.accessToken)).status).toBe(200);
    const response = await setProxy(anne.body.accessToken, USERS.dede.email);

    expect(response.status).toBe(201);
    expect(await proxyId(USERS.anne.id)).toBe(USERS.dede.id);
    expect(await hasMembership(FAMILIES.anne, USERS.baba.id)).toBe(false);
    expect(await hasMembership(FAMILIES.anne, USERS.dede.id)).toBe(true);
  });

  it('allows a removed proxy to be selected by another guardian', async () => {
    const anne = await login(USERS.anne);
    const ayse = await login(USERS.ayse);
    expect(
      (await setProxy(anne.body.accessToken, USERS.baba.email)).status,
    ).toBe(201);
    expect((await removeProxy(anne.body.accessToken)).status).toBe(200);
    const response = await setProxy(ayse.body.accessToken, USERS.baba.email);

    expect(response.status).toBe(201);
    expect(await proxyId(USERS.anne.id)).toBeNull();
    expect(await proxyId(USERS.ayse.id)).toBe(USERS.baba.id);
    expect(await hasMembership(FAMILIES.anne, USERS.baba.id)).toBe(false);
    expect(await hasMembership(FAMILIES.ayse, USERS.baba.id)).toBe(true);
  });

  it('cleans only the removed proxy Family geofence states', async () => {
    const anne = await login(USERS.anne);
    expect((await setProxy(anne.body.accessToken, USERS.baba.email)).status).toBe(201);
    await prisma.familyMember.create({ data: {
      familyId: FAMILIES.guardianB, userId: USERS.baba.id, memberType: MemberType.guardian,
    } });
    const [zoneA, zoneB] = await Promise.all([
      prisma.safeZone.create({ data: { familyId: FAMILIES.anne, name: 'Proxy A', latitude: 40, longitude: 30, radius: 100, createdBy: USERS.anne.id } }),
      prisma.safeZone.create({ data: { familyId: FAMILIES.guardianB, name: 'Proxy B', latitude: 41, longitude: 31, radius: 100, createdBy: USERS.guardianB.id } }),
    ]);
    await prisma.geofenceState.createMany({ data: [
      { userId: USERS.baba.id, safeZoneId: zoneA.id, status: 'inside' },
      { userId: USERS.baba.id, safeZoneId: zoneB.id, status: 'inside' },
    ] });

    expect((await removeProxy(anne.body.accessToken)).status).toBe(200);

    expect(await prisma.geofenceState.findUnique({ where: { userId_safeZoneId: { userId: USERS.baba.id, safeZoneId: zoneA.id } } })).toBeNull();
    expect(await prisma.geofenceState.findUnique({ where: { userId_safeZoneId: { userId: USERS.baba.id, safeZoneId: zoneB.id } } })).not.toBeNull();
  });
});
