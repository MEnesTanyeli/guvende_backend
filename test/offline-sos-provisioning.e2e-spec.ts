import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { constants, generateKeyPairSync, privateDecrypt } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { validateTestDatabaseEnvironment } from '../src/testing/test-database-safety';

const PASSWORD = 'Guv2-E2E-Password-2026';
const USERS = {
  owner: { id: '70000000-0000-4000-8000-000000000001', email: 'guv2-owner@guvende.test', role: 'guardian' },
  guardian: { id: '70000000-0000-4000-8000-000000000002', email: 'guv2-guardian@guvende.test', role: 'guardian' },
  proxy: { id: '70000000-0000-4000-8000-000000000003', email: 'guv2-proxy@guvende.test', role: 'guardian' },
  child: { id: '70000000-0000-4000-8000-000000000004', email: 'guv2-child@guvende.test', role: 'child' },
  elder: { id: '70000000-0000-4000-8000-000000000005', email: 'guv2-elder@guvende.test', role: 'elder' },
  outsider: { id: '70000000-0000-4000-8000-000000000006', email: 'guv2-outsider@guvende.test', role: 'guardian' },
} as const;
const IDS = Object.values(USERS).map((user) => user.id);

describe('GUV2 Offline SOS provisioning E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let passwordHash: string;
  let loginAttempt = 0;
  const wrapping = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const wrappingPublicKey = Buffer.from(wrapping.publicKey.export({ type: 'spki', format: 'der' })).toString('base64url');

  async function safe() {
    validateTestDatabaseEnvironment(process.env);
    const db = await prisma.$queryRaw<Array<{ database: string }>>`SELECT current_database() AS database`;
    if (db[0]?.database !== 'guvende_test') throw new Error('GUV2 fixture guvende_test disinda reddedildi.');
  }
  async function cleanup() { await safe(); await prisma.user.deleteMany({ where: { id: { in: IDS } } }); }
  async function login(user: (typeof USERS)[keyof typeof USERS]) {
    loginAttempt += 1;
    const response = await request(app.getHttpServer()).post('/auth/login')
      .set('X-Forwarded-For', `203.0.113.${loginAttempt}`)
      .send({ email: user.email, password: PASSWORD, deviceId: `guv2-${user.id.slice(-4)}` })
      .expect(201);
    return response.body.accessToken as string;
  }
  async function createFamily(token: string) {
    return request(app.getHttpServer()).post('/families').set('Authorization', `Bearer ${token}`).send({ name: 'GUV2 Family' }).expect(201);
  }
  async function join(token: string, inviteCode: string) {
    return request(app.getHttpServer()).post('/families/join').set('Authorization', `Bearer ${token}`).send({ inviteCode }).expect(201);
  }
  function provision(token: string, familyId: string, guardian = false) {
    return request(app.getHttpServer()).post(`/families/${familyId}/offline-sos/provisioning`)
      .set('Authorization', `Bearer ${token}`).send(guardian ? { deviceWrappingPublicKey: wrappingPublicKey } : {});
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); configureApp(app); await app.init(); prisma = app.get(PrismaService);
    await safe(); passwordHash = await bcrypt.hash(PASSWORD, 10);
  });
  beforeEach(async () => {
    await cleanup();
    await prisma.user.createMany({ data: Object.values(USERS).map(user => ({ ...user, name: user.email, phone: user.role === 'guardian' ? `+90555${user.id.slice(-6)}` : null, passwordHash, trialEndsAt: new Date(Date.now() + 86_400_000) })) });
  });
  afterEach(cleanup);
  afterAll(async () => app?.close());

  it('provisions encrypt-only material to child and elder without private fields', async () => {
    const owner = await login(USERS.owner); const child = await login(USERS.child); const elder = await login(USERS.elder);
    const family = await createFamily(owner); await join(child, family.body.inviteCode); await join(elder, family.body.inviteCode);
    for (const token of [child, elder]) {
      const response = await provision(token, family.body.id).expect(201);
      expect(response.body).toMatchObject({ protocolVersion: 2, keyVersion: 1 });
      expect(response.body.familyPublicEncryptionKey).toBeTruthy();
      expect(response.body.emergencyContacts).toHaveLength(1);
      expect(JSON.stringify(response.body)).not.toMatch(/private|wrappedPrivate|encryptedPrivate/i);
    }
  });

  it('provisions device-wrapped decrypt capability only to same-family guardians', async () => {
    const owner = await login(USERS.owner); const outsider = await login(USERS.outsider);
    const family = await createFamily(owner);
    const response = await provision(owner, family.body.id, true).expect(201);
    const wrapped = Buffer.from(response.body.decryptionKeys[0].wrappedPrivateKey, 'base64url');
    const privateKey = privateDecrypt({ key: wrapping.privateKey, padding: constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, wrapped);
    expect(privateKey.length).toBeGreaterThan(100);
    await provision(outsider, family.body.id, true).expect(403);
  });

  it('rejects revoked membership and rotates when a guardian is removed', async () => {
    const owner = await login(USERS.owner); const guardian = await login(USERS.guardian);
    const family = await createFamily(owner); await join(guardian, family.body.inviteCode);
    expect((await provision(guardian, family.body.id, true).expect(201)).body.keyVersion).toBe(1);
    await request(app.getHttpServer()).delete(`/families/${family.body.id}/members/${USERS.guardian.id}`)
      .set('Authorization', `Bearer ${owner}`).expect(200);
    await provision(guardian, family.body.id, true).expect(403);
    expect((await provision(owner, family.body.id, true).expect(201)).body.keyVersion).toBe(2);
  });

  it('treats proxy as a guardian and rotates when proxy is removed', async () => {
    const owner = await login(USERS.owner); const proxy = await login(USERS.proxy);
    await request(app.getHttpServer()).post('/users/proxy').set('Authorization', `Bearer ${owner}`).send({ email: USERS.proxy.email }).expect(201);
    const family = await createFamily(owner);
    expect((await provision(proxy, family.body.id, true).expect(201)).body.keyVersion).toBe(1);
    await request(app.getHttpServer()).patch('/users/proxy/remove').set('Authorization', `Bearer ${owner}`).expect(200);
    await provision(proxy, family.body.id, true).expect(403);
    expect((await provision(owner, family.body.id, true).expect(201)).body.keyVersion).toBe(2);
  });
});
