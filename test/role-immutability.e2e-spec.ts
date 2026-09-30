import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MemberType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { validateTestDatabaseEnvironment } from '../src/testing/test-database-safety';

const PASSWORD = 'Role-Immutability-E2E-Password-2026';
const USERS = {
  admin: { id: '60000000-0000-4000-8000-000000000011', email: 'role-admin@guvende.test', role: 'admin' },
  guardian: { id: '60000000-0000-4000-8000-000000000012', email: 'role-guardian@guvende.test', role: 'guardian' },
  child: { id: '60000000-0000-4000-8000-000000000013', email: 'role-child@guvende.test', role: 'child' },
  elder: { id: '60000000-0000-4000-8000-000000000014', email: 'role-elder@guvende.test', role: 'elder' },
} as const;
const FAMILY_ID = '60000000-0000-4000-8000-000000000001';
const USER_IDS = Object.values(USERS).map((user) => user.id);
type User = (typeof USERS)[keyof typeof USERS];

describe('User role immutability E2E', () => {
  let app: INestApplication; let prisma: PrismaService; let hash: string; let attempt = 0;
  async function safeDb() { validateTestDatabaseEnvironment(process.env); const result = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`; if (result[0]?.database !== 'guvende_test') throw new Error('Role E2E fixture islemi guvende_test disinda reddedildi.'); }
  async function cleanup() { await safeDb(); await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } }); }
  async function login(user: User, admin = false) { attempt += 1; const response = await request(app.getHttpServer()).post(admin ? '/auth/admin/login' : '/auth/login').set('X-Forwarded-For', `198.51.100.${attempt}`).send({ email: user.email, password: PASSWORD, ...(user.role === 'child' || user.role === 'elder' ? { deviceId: `role-device-${attempt}` } : {}) }).expect(201); return response.body.accessToken as string; }
  async function dbRole(id: string) { return (await prisma.user.findUniqueOrThrow({ where: { id }, select: { role: true } })).role; }

  beforeAll(async () => { const module = await Test.createTestingModule({ imports: [AppModule] }).compile(); app = module.createNestApplication(); configureApp(app); await app.init(); prisma = app.get(PrismaService); await safeDb(); hash = await bcrypt.hash(PASSWORD, 10); });
  beforeEach(async () => { await cleanup(); await prisma.user.createMany({ data: Object.values(USERS).map((user) => ({ ...user, name: user.email.split('@')[0], passwordHash: hash, trialEndsAt: new Date(Date.now() + 86_400_000) })) }); await prisma.family.create({ data: { id: FAMILY_ID, ownerId: USERS.guardian.id, name: 'Role Family' } }); await prisma.familyMember.create({ data: { familyId: FAMILY_ID, userId: USERS.guardian.id, memberType: MemberType.guardian } }); });
  afterEach(async () => { await cleanup(); }); afterAll(async () => { await app?.close(); });

  it.each([
    ['guardian to child', USERS.guardian, 'child'], ['guardian to elder', USERS.guardian, 'elder'],
    ['child to guardian', USERS.child, 'guardian'], ['child to elder', USERS.child, 'elder'],
    ['elder to guardian', USERS.elder, 'guardian'], ['elder to child', USERS.elder, 'child'],
  ])('rejects immutable role transition: %s', async (_label, target, requestedRole) => {
    const response = await request(app.getHttpServer()).patch(`/admin/users/${target.id}`).set('Authorization', `Bearer ${await login(USERS.admin, true)}`).send({ role: requestedRole });
    expect({ status: response.status, role: await dbRole(target.id) }).toEqual({ status: 403, role: target.role });
  });

  it('rejects guardian to child and preserves FamilyMember memberType', async () => {
    const response = await request(app.getHttpServer()).patch(`/admin/users/${USERS.guardian.id}`).set('Authorization', `Bearer ${await login(USERS.admin, true)}`).send({ role: 'child' });
    const membership = await prisma.familyMember.findUniqueOrThrow({ where: { familyId_userId: { familyId: FAMILY_ID, userId: USERS.guardian.id } } });
    expect({ status: response.status, role: await dbRole(USERS.guardian.id), memberType: membership.memberType }).toEqual({ status: 403, role: 'guardian', memberType: MemberType.guardian });
  });

  it.each([USERS.guardian, USERS.child, USERS.elder])('accepts same-role no-op for $role', async (target) => {
    const response = await request(app.getHttpServer()).patch(`/admin/users/${target.id}`).set('Authorization', `Bearer ${await login(USERS.admin, true)}`).send({ role: target.role });
    expect({ status: response.status, role: await dbRole(target.id) }).toEqual({ status: 200, role: target.role });
  });

  it('keeps admin role protections', async () => {
    const adminToken = await login(USERS.admin, true);
    const [adminDowngrade, guardianPromotion] = await Promise.all([
      request(app.getHttpServer()).patch(`/admin/users/${USERS.admin.id}`).set('Authorization', `Bearer ${adminToken}`).send({ role: 'guardian' }),
      request(app.getHttpServer()).patch(`/admin/users/${USERS.guardian.id}`).set('Authorization', `Bearer ${adminToken}`).send({ role: 'admin' }),
    ]);
    expect([adminDowngrade.status, guardianPromotion.status]).toEqual([400, 400]);
  });

  it('rejects role mass-assignment through the normal profile endpoint', async () => {
    const response = await request(app.getHttpServer()).patch('/users/profile').set('Authorization', `Bearer ${await login(USERS.child)}`).send({ role: 'guardian' });
    expect({ status: response.status, role: await dbRole(USERS.child.id) }).toEqual({ status: 400, role: 'child' });
  });
});
