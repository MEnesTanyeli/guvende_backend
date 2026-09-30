import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MemberType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { validateTestDatabaseEnvironment } from '../src/testing/test-database-safety';

const PASSWORD = 'Tracking-Data-Authorization-E2E-Password-2026';
const FAMILIES = { a: '40000000-0000-4000-8000-000000000001', b: '40000000-0000-4000-8000-000000000002' } as const;
const USERS = {
  guardianA: { id: '40000000-0000-4000-8000-000000000011', email: 'tracking-guardian-a@guvende.test', role: 'guardian' },
  guardianA2: { id: '40000000-0000-4000-8000-000000000012', email: 'tracking-guardian-a2@guvende.test', role: 'guardian' },
  childA: { id: '40000000-0000-4000-8000-000000000013', email: 'tracking-child-a@guvende.test', role: 'child' },
  childA2: { id: '40000000-0000-4000-8000-000000000014', email: 'tracking-child-a2@guvende.test', role: 'child' },
  elderA: { id: '40000000-0000-4000-8000-000000000015', email: 'tracking-elder-a@guvende.test', role: 'elder' },
  elderA2: { id: '40000000-0000-4000-8000-000000000016', email: 'tracking-elder-a2@guvende.test', role: 'elder' },
  guardianB: { id: '40000000-0000-4000-8000-000000000017', email: 'tracking-guardian-b@guvende.test', role: 'guardian' },
  childB: { id: '40000000-0000-4000-8000-000000000018', email: 'tracking-child-b@guvende.test', role: 'child' },
  elderB: { id: '40000000-0000-4000-8000-000000000019', email: 'tracking-elder-b@guvende.test', role: 'elder' },
  unrelated: { id: '40000000-0000-4000-8000-000000000020', email: 'tracking-unrelated@guvende.test', role: 'guardian' },
} as const;
const USER_IDS = Object.values(USERS).map((user) => user.id);
type TestUser = (typeof USERS)[keyof typeof USERS];

function istanbulDayStart(): Date {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts();
  const read = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return new Date(Date.UTC(read('year'), read('month') - 1, read('day'), -3));
}

describe('Activity and App Usage tracking-data authorization E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordHash: string;
  let loginAttempt = 0;

  async function assertSafeDatabase(): Promise<void> {
    validateTestDatabaseEnvironment(process.env);
    const result = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
    if (result[0]?.database !== 'guvende_test') throw new Error('Tracking E2E fixture islemi guvende_test disinda reddedildi.');
  }

  async function removeFixtures(): Promise<void> {
    await assertSafeDatabase();
    await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } });
  }

  async function login(user: TestUser): Promise<string> {
    loginAttempt += 1;
    const response = await request(app.getHttpServer()).post('/auth/login')
      .set('X-Forwarded-For', `198.51.100.${loginAttempt}`)
      .send({ email: user.email, password: PASSWORD, ...(user.role === 'child' || user.role === 'elder' ? { deviceId: `tracking-device-${loginAttempt}` } : {}) })
      .expect(201);
    return response.body.accessToken as string;
  }

  async function requests(requester: TestUser, target: TestUser) {
    const token = await login(requester);
    const [activity, appUsage] = await Promise.all([
      request(app.getHttpServer()).get(`/activity/daily?memberId=${target.id}`).set('Authorization', `Bearer ${token}`),
      request(app.getHttpServer()).get(`/app-usage/member/${target.id}`).set('Authorization', `Bearer ${token}`),
    ]);
    return { activity, appUsage };
  }

  async function activityRequest(requester: TestUser, target: TestUser) {
    const token = await login(requester);
    return request(app.getHttpServer())
      .get(`/activity/daily?memberId=${target.id}`)
      .set('Authorization', `Bearer ${token}`);
  }

  function expectNoSensitivePayload(response: request.Response, target: TestUser) {
    const body = JSON.stringify(response.body);
    expect(body).not.toContain(target.id);
    expect(body).not.toContain(`private.${target.id.slice(-4)}`);
    expect(body).not.toContain(`Private ${target.id.slice(-4)}`);
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.init();
    prisma = app.get(PrismaService);
    await assertSafeDatabase();
    passwordHash = await bcrypt.hash(PASSWORD, 10);
  });

  beforeEach(async () => {
    await removeFixtures();
    await prisma.user.createMany({ data: Object.values(USERS).map((user) => ({ ...user, name: user.email.split('@')[0], passwordHash, trialEndsAt: new Date(Date.now() + 86_400_000) })) });
    await prisma.family.createMany({ data: [
      { id: FAMILIES.a, name: 'Tracking Family A', ownerId: USERS.guardianA.id },
      { id: FAMILIES.b, name: 'Tracking Family B', ownerId: USERS.guardianB.id },
    ] });
    await prisma.familyMember.createMany({ data: [
      USERS.guardianA, USERS.guardianA2, USERS.childA, USERS.childA2, USERS.elderA, USERS.elderA2,
    ].map((user) => ({ familyId: FAMILIES.a, userId: user.id, memberType: user.role as MemberType } as any)).concat([
      { familyId: FAMILIES.b, userId: USERS.guardianB.id, memberType: MemberType.guardian },
      { familyId: FAMILIES.b, userId: USERS.childB.id, memberType: MemberType.child },
      { familyId: FAMILIES.b, userId: USERS.elderB.id, memberType: MemberType.elder },
    ]) });
    const date = istanbulDayStart();
    await prisma.activitySnapshot.createMany({ data: [USERS.childA, USERS.childA2, USERS.elderA, USERS.elderA2, USERS.guardianA2].map((user, index) => ({ userId: user.id, date, totalDistance: 100 + index, activeMinutes: 10 + index, visitedPlacesCount: 2 })) });
    await prisma.appUsage.createMany({ data: [USERS.childA, USERS.childA2, USERS.elderA, USERS.elderA2, USERS.guardianA2].map((user, index) => ({ userId: user.id, packageName: `private.${user.id.slice(-4)}`, appName: `Private ${user.id.slice(-4)}`, durationMin: 10 + index, recordedDate: date })) });
  });

  afterEach(async () => { await removeFixtures(); });
  afterAll(async () => { await app?.close(); });

  it.each([
    ['guardian to same-family child', USERS.guardianA, USERS.childA, true],
    ['guardian to same-family elder', USERS.guardianA, USERS.elderA, true],
    ['child to another child', USERS.childA, USERS.childA2, false],
    ['child to elder', USERS.childA, USERS.elderA, false],
    ['elder to child', USERS.elderA, USERS.childA, false],
    ['elder to another elder', USERS.elderA, USERS.elderA2, false],
    ['cross-family guardian to child', USERS.guardianB, USERS.childA, false],
    ['cross-family child to elder', USERS.childB, USERS.elderA, false],
  ])('%s has the same Activity and App Usage authorization result', async (_label, requester, target, allowed) => {
    const { activity, appUsage } = await requests(requester, target);
    if (allowed) {
      expect(activity.status).toBe(200);
      expect(activity.body).toMatchObject({ userId: target.id });
      expect(appUsage.status).toBe(200);
      expect(JSON.stringify(appUsage.body)).toContain(`private.${target.id.slice(-4)}`);
    } else {
      expect({ activity: activity.status, appUsage: appUsage.status }).toEqual({ activity: 403, appUsage: 403 });
      expectNoSensitivePayload(activity, target);
      expectNoSensitivePayload(appUsage, target);
    }
  });

  it('observes guardian-to-guardian behavior as denied', async () => {
    const { activity, appUsage } = await requests(USERS.guardianA, USERS.guardianA2);
    expect({ activity: activity.status, appUsage: appUsage.status }).toEqual({ activity: 403, appUsage: 403 });
  });

  it.each([USERS.childA, USERS.elderA])('$role self-access currently succeeds', async (user) => {
    const { activity, appUsage } = await requests(user, user);
    expect({ activity: activity.status, appUsage: appUsage.status }).toEqual({ activity: 200, appUsage: 200 });
  });

  it('rejects an unrelated guardian', async () => {
    const response = await activityRequest(USERS.unrelated, USERS.childA);
    expect(response.status).toBe(403);
    expectNoSensitivePayload(response, USERS.childA);
  });

  it('uses FamilyMember.memberType instead of a guardian global role', async () => {
    await prisma.familyMember.update({
      where: { familyId_userId: { familyId: FAMILIES.a, userId: USERS.guardianA.id } },
      data: { memberType: MemberType.child },
    });

    const response = await activityRequest(USERS.guardianA, USERS.childA);
    expect(response.status).toBe(403);
    expectNoSensitivePayload(response, USERS.childA);
  });

  it('grants family guardian access even when the global role is child', async () => {
    await prisma.familyMember.update({
      where: { familyId_userId: { familyId: FAMILIES.a, userId: USERS.childA.id } },
      data: { memberType: MemberType.guardian },
    });
    const token = await login(USERS.childA);

    const [childResponse, elderResponse] = await Promise.all([
      request(app.getHttpServer()).get(`/activity/daily?memberId=${USERS.childA2.id}`).set('Authorization', `Bearer ${token}`),
      request(app.getHttpServer()).get(`/activity/daily?memberId=${USERS.elderA.id}`).set('Authorization', `Bearer ${token}`),
    ]);

    expect([childResponse.status, elderResponse.status]).toEqual([200, 200]);
  });

  it('treats a proxy guardian membership like a normal guardian membership', async () => {
    await prisma.user.update({
      where: { id: USERS.guardianA.id },
      data: { proxyId: USERS.guardianA2.id },
    });
    await prisma.familyMember.update({
      where: { familyId_userId: { familyId: FAMILIES.a, userId: USERS.guardianA2.id } },
      data: { memberType: MemberType.guardian, permissions: ['all', 'proxy'] },
    });
    const token = await login(USERS.guardianA2);

    const [childResponse, elderResponse] = await Promise.all([
      request(app.getHttpServer()).get(`/activity/daily?memberId=${USERS.childA.id}`).set('Authorization', `Bearer ${token}`),
      request(app.getHttpServer()).get(`/activity/daily?memberId=${USERS.elderA.id}`).set('Authorization', `Bearer ${token}`),
    ]);

    expect([childResponse.status, elderResponse.status]).toEqual([200, 200]);
  });

  it('requires an access token', async () => {
    await request(app.getHttpServer())
      .get(`/activity/daily?memberId=${USERS.childA.id}`)
      .expect(401);
  });

  it.each([
    ['invalid memberId', 'memberId=not-a-uuid'],
    ['invalid date format', `memberId=${USERS.childA.id}&date=25-09-2026`],
    ['invalid calendar date', `memberId=${USERS.childA.id}&date=2026-02-31`],
  ])('returns 400 for %s', async (_label, query) => {
    const token = await login(USERS.guardianA);
    await request(app.getHttpServer())
      .get(`/activity/daily?${query}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('does not create a historical snapshot for an unauthorized request', async () => {
    const historicalDate = '2026-01-15';
    await prisma.location.create({
      data: {
        userId: USERS.childA.id,
        latitude: 39.925,
        longitude: 32.8369,
        recordedAt: new Date('2026-01-15T12:00:00+03:00'),
      },
    });
    const token = await login(USERS.guardianB);

    await request(app.getHttpServer())
      .get(`/activity/daily?memberId=${USERS.childA.id}&date=${historicalDate}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(await prisma.activitySnapshot.count({
      where: { userId: USERS.childA.id, date: new Date('2026-01-15T00:00:00+03:00') },
    })).toBe(0);
  });

  it('returns only ActivitySnapshot fields for an authorized response', async () => {
    const response = await activityRequest(USERS.guardianA, USERS.childA);
    expect(response.status).toBe(200);
    expect(Object.keys(response.body).sort()).toEqual([
      'activeMinutes',
      'createdAt',
      'date',
      'id',
      'totalDistance',
      'userId',
      'visitedPlacesCount',
    ]);
    expect(response.body).not.toHaveProperty('user');
    expect(response.body).not.toHaveProperty('family');
  });
});
