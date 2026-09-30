import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MemberType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { validateTestDatabaseEnvironment } from '../src/testing/test-database-safety';

const PASSWORD = 'Invite-Authorization-E2E-Password-2026';
const INVITE_CODE = 'INVITEA8';
const FAMILIES = { a: '50000000-0000-4000-8000-000000000001', b: '50000000-0000-4000-8000-000000000002' } as const;
const USERS = {
  ownerA: { id: '50000000-0000-4000-8000-000000000011', email: 'invite-owner-a@guvende.test', role: 'guardian' },
  guardianA2: { id: '50000000-0000-4000-8000-000000000012', email: 'invite-guardian-a2@guvende.test', role: 'guardian' },
  childA: { id: '50000000-0000-4000-8000-000000000013', email: 'invite-child-a@guvende.test', role: 'child' },
  elderA: { id: '50000000-0000-4000-8000-000000000014', email: 'invite-elder-a@guvende.test', role: 'elder' },
  proxyP: { id: '50000000-0000-4000-8000-000000000015', email: 'invite-proxy-p@guvende.test', role: 'guardian' },
  ownerB: { id: '50000000-0000-4000-8000-000000000016', email: 'invite-owner-b@guvende.test', role: 'guardian' },
  childB: { id: '50000000-0000-4000-8000-000000000017', email: 'invite-child-b@guvende.test', role: 'child' },
} as const;
const USER_IDS = Object.values(USERS).map((user) => user.id);
type TestUser = (typeof USERS)[keyof typeof USERS];

describe('Invite code exposure and invitation authorization E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordHash: string;
  let attempt = 0;

  async function safeDb() {
    validateTestDatabaseEnvironment(process.env);
    const database = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
    if (database[0]?.database !== 'guvende_test') throw new Error('Invite E2E fixture islemi guvende_test disinda reddedildi.');
  }
  async function removeFixtures() { await safeDb(); await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } }); }
  async function login(user: TestUser): Promise<string> {
    attempt += 1;
    const response = await request(app.getHttpServer()).post('/auth/login').set('X-Forwarded-For', `198.51.100.${attempt}`).send({ email: user.email, password: PASSWORD, ...(user.role === 'child' || user.role === 'elder' ? { deviceId: `invite-device-${attempt}` } : {}) }).expect(201);
    return response.body.accessToken as string;
  }
  async function get(token: string, path: string) { return request(app.getHttpServer()).get(path).set('Authorization', `Bearer ${token}`); }
  function hasCode(response: request.Response) { return JSON.stringify(response.body).includes(INVITE_CODE); }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init(); prisma = app.get(PrismaService);
    await safeDb(); passwordHash = await bcrypt.hash(PASSWORD, 10);
  });
  beforeEach(async () => {
    await removeFixtures();
    await prisma.user.createMany({ data: Object.values(USERS).map((user) => ({ ...user, name: user.email.split('@')[0], passwordHash, trialEndsAt: new Date(Date.now() + 86_400_000) })) });
    await prisma.family.createMany({ data: [
      { id: FAMILIES.a, ownerId: USERS.ownerA.id, name: 'Invite Family A', inviteCode: INVITE_CODE },
      { id: FAMILIES.b, ownerId: USERS.ownerB.id, name: 'Invite Family B', inviteCode: 'INVITEB8' },
    ] });
    await prisma.familyMember.createMany({ data: [
      { familyId: FAMILIES.a, userId: USERS.ownerA.id, memberType: MemberType.guardian },
      { familyId: FAMILIES.a, userId: USERS.guardianA2.id, memberType: MemberType.guardian },
      { familyId: FAMILIES.a, userId: USERS.childA.id, memberType: MemberType.child },
      { familyId: FAMILIES.a, userId: USERS.elderA.id, memberType: MemberType.elder },
      { familyId: FAMILIES.b, userId: USERS.ownerB.id, memberType: MemberType.guardian },
      { familyId: FAMILIES.b, userId: USERS.childB.id, memberType: MemberType.child },
    ] });
    const ownerToken = await login(USERS.ownerA);
    await request(app.getHttpServer()).post('/users/proxy').set('Authorization', `Bearer ${ownerToken}`).send({ email: USERS.proxyP.email }).expect(201);
  });
  afterEach(async () => { await removeFixtures(); });
  afterAll(async () => { await app?.close(); });

  it('returns the owner invite code in the family list', async () => {
    const response = await get(await login(USERS.ownerA), '/families');
    expect({ status: response.status, exposed: hasCode(response) }).toEqual({ status: 200, exposed: true });
  });

  it.each([USERS.guardianA2, USERS.proxyP, USERS.childA, USERS.elderA])('$role non-owner does not receive inviteCode in GET /families', async (user) => {
    const response = await get(await login(user), '/families');
    expect({ status: response.status, exposed: hasCode(response) }).toEqual({ status: 200, exposed: false });
  });

  it('returns the owner invite code in family detail', async () => {
    const response = await get(await login(USERS.ownerA), `/families/${FAMILIES.a}`);
    expect({ status: response.status, exposed: hasCode(response) }).toEqual({ status: 200, exposed: true });
  });

  it.each([USERS.guardianA2, USERS.proxyP, USERS.childA, USERS.elderA])('$role non-owner does not receive inviteCode in family detail', async (user) => {
    const response = await get(await login(user), `/families/${FAMILIES.a}`);
    expect({ status: response.status, exposed: hasCode(response) }).toEqual({ status: 200, exposed: false });
  });

  it.each([
    ['owner', USERS.ownerA, 201, true],
    ['normal guardian', USERS.guardianA2, 403, false],
    ['proxy guardian', USERS.proxyP, 403, false],
    ['child', USERS.childA, 403, false],
    ['elder', USERS.elderA, 403, false],
  ])('allows only the owner to use the invite endpoint: %s', async (_label, user, expectedStatus, codeAllowed) => {
    const response = await request(app.getHttpServer()).post(`/families/${FAMILIES.a}/invite`).set('Authorization', `Bearer ${await login(user)}`);
    expect({ status: response.status, exposed: hasCode(response) }).toEqual({ status: expectedStatus, exposed: codeAllowed });
  });

  it('does not expose Family A invite code to Family B owner', async () => {
    const response = await request(app.getHttpServer()).post(`/families/${FAMILIES.a}/invite`).set('Authorization', `Bearer ${await login(USERS.ownerB)}`);
    expect([403, 404]).toContain(response.status);
    expect(hasCode(response)).toBe(false);
  });

  it('does not treat a family UUID as an invite code', async () => {
    const response = await request(app.getHttpServer()).post('/families/join').set('Authorization', `Bearer ${await login(USERS.childB)}`).send({ inviteCode: FAMILIES.a });
    expect({ status: response.status, exposed: hasCode(response) }).toEqual({ status: 404, exposed: false });
  });
});
