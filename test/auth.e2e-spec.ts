import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { validateTestDatabaseEnvironment } from '../src/testing/test-database-safety';

const TEST_USER_ID = '00000000-0000-4000-8000-0000000000a1';
const TEST_EMAIL = 'auth-e2e-user@guvende.test';
const TEST_PASSWORD = 'Auth-E2E-Password-2026';
const MISSING_EMAIL = 'missing-auth-user@guvende.test';

describe('Auth E2E package 1', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let fetchSpy: jest.SpyInstance;

  async function removeFixture(): Promise<void> {
    validateTestDatabaseEnvironment(process.env);
    await prisma.user.deleteMany({
      where: { id: TEST_USER_ID, email: TEST_EMAIL },
    });
  }

  beforeAll(async () => {
    // Block external providers even if a future auth dependency accidentally calls one.
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

    const database = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    if (database[0]?.database !== 'guvende_test') {
      throw new Error('Auth E2E fixture islemi reddedildi: hedef guvende_test degil.');
    }
  });

  beforeEach(async () => {
    await removeFixture();
    await prisma.user.create({
      data: {
        id: TEST_USER_ID,
        name: 'Auth E2E User',
        email: TEST_EMAIL,
        passwordHash: await bcrypt.hash(TEST_PASSWORD, 10),
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

  it('logs in through HTTP with the real password hash and PostgreSQL user', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
      .expect(201);

    expect(response.body).toMatchObject({
      message: 'Giriş başarılı.',
      token: expect.any(String),
      accessToken: expect.any(String),
      refreshToken: expect.any(String),
      accessTokenExpiresIn: expect.any(Number),
      refreshTokenExpiresAt: expect.any(String),
      user: {
        id: TEST_USER_ID,
        email: TEST_EMAIL,
        role: 'guardian',
      },
    });
    expect(response.body.token).toBe(response.body.accessToken);
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects an existing user with the wrong password', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: 'Wrong-Password-2026' })
      .expect(401);

    expect(response.body).toEqual({
      message: 'E-posta veya şifre hatalı.',
      error: 'Unauthorized',
      statusCode: 401,
    });
    expect(JSON.stringify(response.body)).not.toContain(TEST_EMAIL);
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');
  });

  it('rejects a login for a user that does not exist', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: MISSING_EMAIL, password: 'Any-Password-2026' })
      .expect(401);

    expect(response.body).toEqual({
      message: 'E-posta veya şifre hatalı.',
      error: 'Unauthorized',
      statusCode: 401,
    });
  });

  it('returns the same observable error for wrong password and missing user', async () => {
    const wrongPassword = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: TEST_EMAIL, password: 'Wrong-Password-2026' });
    const missingUser = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: MISSING_EMAIL, password: 'Any-Password-2026' });

    expect(wrongPassword.status).toBe(401);
    expect(missingUser.status).toBe(401);
    expect(wrongPassword.body).toEqual(missingUser.body);
  });

  it('rejects the existing protected endpoint without an access token', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });
});
