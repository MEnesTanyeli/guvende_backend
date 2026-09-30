import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { validateTestDatabaseEnvironment } from '../src/testing/test-database-safety';

const TEST_USER_ID = '00000000-0000-4000-8000-0000000000b1';
const TEST_EMAIL = 'auth-refresh-e2e@guvende.test';
const TEST_PASSWORD = 'Refresh-E2E-Password-2026';
const REUSE_GRACE_MS = 3_000;

const tokenHash = (token: string) =>
  createHash('sha256').update(token).digest('hex');

describe('Refresh token and session E2E', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let passwordHash: string;
  let fetchSpy: jest.SpyInstance;

  async function assertSafeDatabase(): Promise<void> {
    validateTestDatabaseEnvironment(process.env);
    const database = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    if (database[0]?.database !== 'guvende_test') {
      throw new Error('Refresh E2E fixture islemi reddedildi: hedef guvende_test degil.');
    }
  }

  async function removeFixture(): Promise<void> {
    await assertSafeDatabase();
    await prisma.user.deleteMany({
      where: { id: TEST_USER_ID, email: TEST_EMAIL },
    });
  }

  async function login(deviceId?: string) {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        ...(deviceId ? { deviceId } : {}),
      })
      .expect(201);
  }

  async function refresh(refreshToken: string) {
    return request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken });
  }

  async function ageRotatedTokenPastGrace(refreshToken: string): Promise<void> {
    await assertSafeDatabase();
    await prisma.session.update({
      where: { refreshTokenHash: tokenHash(refreshToken) },
      data: { revokedAt: new Date(Date.now() - REUSE_GRACE_MS - 1_000) },
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
    passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  });

  beforeEach(async () => {
    await removeFixture();
    await prisma.user.create({
      data: {
        id: TEST_USER_ID,
        name: 'Refresh E2E User',
        email: TEST_EMAIL,
        passwordHash,
        role: 'guardian',
      },
    });
  });

  afterEach(async () => {
    await removeFixture();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockClear();
  });

  afterAll(async () => {
    if (app) await app.close();
    fetchSpy?.mockRestore();
  });

  it('rotates R1 to a new access token and R2 in one token family', async () => {
    const loginResponse = await login('rotation-device');
    const accessTokenA1 = loginResponse.body.accessToken as string;
    const refreshTokenR1 = loginResponse.body.refreshToken as string;
    const rotation = await refresh(refreshTokenR1);

    expect(rotation.status).toBe(201);
    expect(rotation.body.accessToken).toEqual(expect.any(String));
    expect(rotation.body.refreshToken).toEqual(expect.any(String));
    expect(rotation.body.accessToken).not.toBe(accessTokenA1);
    expect(rotation.body.refreshToken).not.toBe(refreshTokenR1);

    const sessions = await prisma.session.findMany({
      where: { userId: TEST_USER_ID },
      orderBy: { createdAt: 'asc' },
    });
    expect(sessions).toHaveLength(2);
    expect(sessions[0]).toMatchObject({
      refreshTokenHash: tokenHash(refreshTokenR1),
      revokedAt: expect.any(Date),
      replacedByTokenHash: tokenHash(rotation.body.refreshToken),
    });
    expect(sessions[1]).toMatchObject({
      refreshTokenHash: tokenHash(rotation.body.refreshToken),
      revokedAt: null,
      replacedByTokenHash: null,
    });
    expect(sessions[1].tokenFamilyId).toBe(sessions[0].tokenFamilyId);
  });

  it('continues a valid R1 to R2 to R3 rotation chain', async () => {
    const first = await login('chain-device');
    const r1 = first.body.refreshToken as string;
    const second = await refresh(r1);
    expect(second.status).toBe(201);
    const r2 = second.body.refreshToken as string;
    const third = await refresh(r2);
    expect(third.status).toBe(201);
    const r3 = third.body.refreshToken as string;

    expect(new Set([r1, r2, r3]).size).toBe(3);
    const sessions = await prisma.session.findMany({
      where: { userId: TEST_USER_ID },
      orderBy: { createdAt: 'asc' },
    });
    expect(sessions).toHaveLength(3);
    expect(new Set(sessions.map((session) => session.tokenFamilyId)).size).toBe(1);
    expect(sessions.filter((session) => session.revokedAt === null)).toHaveLength(1);
    expect(sessions[2].refreshTokenHash).toBe(tokenHash(r3));
  });

  it('handles two genuinely concurrent uses of R1 with one success and one grace conflict', async () => {
    const loginResponse = await login('concurrent-device');
    const r1 = loginResponse.body.refreshToken as string;

    // Both HTTP requests are created before either is awaited and start together.
    const firstRequest = refresh(r1);
    const secondRequest = refresh(r1);
    const [first, second] = await Promise.all([firstRequest, secondRequest]);
    const responses = [first, second].sort((a, b) => a.status - b.status);

    expect(responses.map((response) => response.status)).toEqual([201, 409]);
    expect(responses[1].body).toMatchObject({
      statusCode: 409,
      code: 'REFRESH_ALREADY_ROTATED',
      retryAfterMs: expect.any(Number),
    });
    expect(responses[1].body.retryAfterMs).toBeGreaterThanOrEqual(0);
    expect(responses[1].body.retryAfterMs).toBeLessThanOrEqual(REUSE_GRACE_MS);

    const sessions = await prisma.session.findMany({
      where: { userId: TEST_USER_ID },
    });
    expect(sessions).toHaveLength(2);
    expect(sessions.filter((session) => session.revokedAt === null)).toHaveLength(1);
    expect(new Set(sessions.map((session) => session.tokenFamilyId)).size).toBe(1);
  });

  it('revokes the active token family when rotated R1 is reused after grace', async () => {
    const loginResponse = await login('reuse-device');
    const r1 = loginResponse.body.refreshToken as string;
    const rotation = await refresh(r1);
    expect(rotation.status).toBe(201);
    const r2 = rotation.body.refreshToken as string;
    await ageRotatedTokenPastGrace(r1);

    const reuse = await refresh(r1);
    expect(reuse.status).toBe(401);

    const sessions = await prisma.session.findMany({
      where: { userId: TEST_USER_ID },
    });
    expect(sessions).toHaveLength(2);
    expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
    const revokedR2 = await refresh(r2);
    expect(revokedR2.status).toBe(401);
  });

  it('keeps device B token family valid when reuse revokes device A family', async () => {
    const deviceA = await login('device-a');
    const deviceB = await login('device-b');
    const r1A = deviceA.body.refreshToken as string;
    const r1B = deviceB.body.refreshToken as string;
    const rotationA = await refresh(r1A);
    expect(rotationA.status).toBe(201);
    await ageRotatedTokenPastGrace(r1A);
    const reuseA = await refresh(r1A);
    expect(reuseA.status).toBe(401);

    const originalA = await prisma.session.findUniqueOrThrow({
      where: { refreshTokenHash: tokenHash(r1A) },
    });
    const familyA = await prisma.session.findMany({
      where: { userId: TEST_USER_ID, tokenFamilyId: originalA.tokenFamilyId },
    });
    expect(familyA.every((session) => session.revokedAt !== null)).toBe(true);

    const originalB = await prisma.session.findUniqueOrThrow({
      where: { refreshTokenHash: tokenHash(r1B) },
    });
    expect(originalB.tokenFamilyId).not.toBe(originalA.tokenFamilyId);
    expect(originalB.revokedAt).toBeNull();
    const rotationB = await refresh(r1B);
    expect(rotationB.status).toBe(201);

    const activeB = await prisma.session.findMany({
      where: {
        userId: TEST_USER_ID,
        tokenFamilyId: originalB.tokenFamilyId,
        revokedAt: null,
      },
    });
    expect(activeB).toHaveLength(1);
  });

  it('rejects an access token after its session is revoked through logout', async () => {
    const loginResponse = await login('logout-device');
    const accessToken = loginResponse.body.accessToken as string;
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);

    const session = await prisma.session.findUniqueOrThrow({
      where: {
        refreshTokenHash: tokenHash(loginResponse.body.refreshToken as string),
      },
    });
    expect(session.revokedAt).toEqual(expect.any(Date));
  });
});
