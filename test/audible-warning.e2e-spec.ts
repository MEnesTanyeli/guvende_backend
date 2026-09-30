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

const FAMILY_A = '00000000-0000-4000-8000-0000000006f1';
const FAMILY_B = '00000000-0000-4000-8000-0000000006f2';
const U = {
  mom: '00000000-0000-4000-8000-0000000006a1',
  dad: '00000000-0000-4000-8000-0000000006a2',
  proxy: '00000000-0000-4000-8000-0000000006a3',
  guardian4: '00000000-0000-4000-8000-0000000006a4',
  child: '00000000-0000-4000-8000-0000000006b1',
  childB: '00000000-0000-4000-8000-0000000006b2',
  elder: '00000000-0000-4000-8000-0000000006b3',
  guardianTarget: '00000000-0000-4000-8000-0000000006b4',
  crossGuardian: '00000000-0000-4000-8000-0000000006c1',
};
const USER_IDS = Object.values(U);

describe('Audible Warning cooldown and idempotency E2E', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let jwt: JwtService;
  let tokens: Record<keyof typeof U, string>;
  let pushSpy: jest.SpyInstance;
  let familyNotificationSpy: jest.SpyInstance;
  let statusSocketSpy: jest.SpyInstance;

  async function assertSafeDatabase() {
    validateTestDatabaseEnvironment(process.env);
    const db = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    if (db[0]?.database !== 'guvende_test') {
      throw new Error('Audible Warning E2E guvende_test disinda reddedildi.');
    }
  }

  async function cleanup() {
    await assertSafeDatabase();
    await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } });
  }

  async function tokenFor(id: string, email: string) {
    const session = await prisma.session.create({
      data: {
        userId: id,
        tokenFamilyId: randomUUID(),
        refreshTokenHash: randomUUID(),
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });
    return jwt.sign({ sub: id, email, sid: session.id, typ: 'access' });
  }

  function send(
    sender: keyof typeof U,
    targetUserId: string,
    eventId: string = randomUUID(),
  ) {
    return request(app.getHttpServer())
      .post('/locations/audible-warning')
      .set('Authorization', `Bearer ${tokens[sender]}`)
      .send({ targetUserId, eventId });
  }

  function ack(actor: keyof typeof U, warningId: string, action: string) {
    return request(app.getHttpServer())
      .post('/locations/audible-warning/ack')
      .set('Authorization', `Bearer ${tokens[actor]}`)
      .send({ warningId, action });
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
    jwt = app.get(JwtService);
    await assertSafeDatabase();
    const notifications = app.get(NotificationsService);
    pushSpy = jest.spyOn(notifications, 'sendOneSignalNotification').mockResolvedValue(undefined);
    familyNotificationSpy = jest.spyOn(notifications, 'sendFamilyNotification').mockResolvedValue({ success: true, recipientsCount: 1 });
    statusSocketSpy = jest.spyOn(app.get(LocationsGateway), 'sendEventToUser').mockReturnValue(true);
  });

  beforeEach(async () => {
    await cleanup();
    pushSpy.mockReset().mockResolvedValue(undefined);
    familyNotificationSpy.mockClear();
    statusSocketSpy.mockClear();
    const trialEndsAt = new Date(Date.now() + 86_400_000);
    await prisma.user.createMany({
      data: USER_IDS.map((id, index) => ({
        id,
        name: `Warning User ${index}`,
        email: `warning-${index}@guvende.test`,
        passwordHash: 'unused-e2e-hash',
        role: index >= 4 && index <= 6 ? (index === 6 ? 'elder' : 'child') : 'guardian',
        trialEndsAt,
      })),
    });
    await prisma.family.createMany({
      data: [
        { id: FAMILY_A, name: 'Warning Family A', ownerId: U.mom },
        { id: FAMILY_B, name: 'Warning Family B', ownerId: U.crossGuardian },
      ],
    });
    await prisma.familyMember.createMany({
      data: [
        { familyId: FAMILY_A, userId: U.mom, memberType: 'guardian' },
        { familyId: FAMILY_A, userId: U.dad, memberType: 'guardian' },
        { familyId: FAMILY_A, userId: U.proxy, memberType: 'guardian' },
        { familyId: FAMILY_A, userId: U.guardian4, memberType: 'guardian' },
        { familyId: FAMILY_A, userId: U.child, memberType: 'child' },
        { familyId: FAMILY_A, userId: U.childB, memberType: 'child' },
        { familyId: FAMILY_A, userId: U.elder, memberType: 'elder' },
        { familyId: FAMILY_A, userId: U.guardianTarget, memberType: 'guardian' },
        { familyId: FAMILY_B, userId: U.crossGuardian, memberType: 'guardian' },
      ],
    });
    tokens = {} as Record<keyof typeof U, string>;
    for (const [index, name] of (Object.keys(U) as Array<keyof typeof U>).entries()) {
      tokens[name] = await tokenFor(U[name], `warning-${index}@guvende.test`);
    }
  });

  afterEach(cleanup);
  afterAll(async () => {
    if (app) await app.close();
  });

  it('allows guardian and proxy guardian warnings to Child/Elder with server warning IDs', async () => {
    const child = await send('mom', U.child).expect(201);
    const elder = await send('mom', U.elder).expect(201);
    const proxy = await send('proxy', U.childB).expect(201);

    for (const response of [child, elder, proxy]) {
      expect(response.body).toMatchObject({ success: true, idempotent: false, warningId: expect.any(String) });
    }
    expect(pushSpy).toHaveBeenCalledTimes(3);
    expect(pushSpy.mock.calls.map((call) => call[0])).toEqual([[U.child], [U.elder], [U.childB]]);
  });

  it('preserves memberType authorization boundaries', async () => {
    await send('child', U.elder).expect(403);
    await send('elder', U.child).expect(403);
    await send('mom', U.guardianTarget).expect(403);
    await send('mom', U.mom).expect(403);
    await send('crossGuardian', U.child).expect(403);
    expect(await prisma.audibleWarning.count()).toBe(0);
    expect(pushSpy).not.toHaveBeenCalled();
  });

  it('deduplicates retry, blocks new event during cooldown and isolates another target', async () => {
    const eventId = randomUUID();
    const first = await send('mom', U.child, eventId).expect(201);
    pushSpy.mockClear();
    const retry = await send('mom', U.child, eventId).expect(201);
    expect(retry.body).toMatchObject({ warningId: first.body.warningId, idempotent: true });
    expect(pushSpy).not.toHaveBeenCalled();

    const blocked = await send('mom', U.child).expect(429);
    expect(blocked.body).toMatchObject({ code: 'AUDIBLE_WARNING_COOLDOWN_ACTIVE', retryAfterSeconds: expect.any(Number) });
    expect(await prisma.audibleWarning.count({ where: { targetUserId: U.child } })).toBe(1);
    expect(pushSpy).not.toHaveBeenCalled();

    await send('mom', U.childB).expect(201);
    await assertSafeDatabase();
    await prisma.audibleWarning.updateMany({
      where: { senderId: U.mom, targetUserId: U.child },
      data: { createdAt: new Date(Date.now() - 61_000) },
    });
    await send('mom', U.child).expect(201);
  });

  it('serializes concurrent retries into one warning and one push', async () => {
    const eventId = randomUUID();
    const [first, second] = await Promise.all([
      send('mom', U.child, eventId),
      send('mom', U.child, eventId),
    ]);
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(first.body.warningId).toBe(second.body.warningId);
    expect([first.body.idempotent, second.body.idempotent].sort()).toEqual([false, true]);
    expect(await prisma.audibleWarning.count()).toBe(1);
    expect(pushSpy).toHaveBeenCalledTimes(1);
  });

  it('allows three independent guardians but blocks the fourth target-centric burst', async () => {
    await send('mom', U.child).expect(201);
    await send('dad', U.child).expect(201);
    await send('proxy', U.child).expect(201);
    const blocked = await send('guardian4', U.child).expect(429);
    expect(blocked.body.code).toBe('AUDIBLE_WARNING_COOLDOWN_ACTIVE');
    expect(await prisma.audibleWarning.count({ where: { targetUserId: U.child } })).toBe(3);
    expect(pushSpy).toHaveBeenCalledTimes(3);
  });

  it('keeps ACK authorization, terminal idempotency and one unanswered SOS Alert', async () => {
    const first = await send('mom', U.child).expect(201);
    await ack('childB', first.body.warningId, 'received').expect(403);
    await ack('crossGuardian', first.body.warningId, 'received').expect(403);
    await ack('child', first.body.warningId, 'received').expect(201);
    await ack('child', first.body.warningId, 'muted').expect(201);
    const duplicate = await ack('child', first.body.warningId, 'muted').expect(201);
    expect(duplicate.body.duplicate).toBe(true);

    await assertSafeDatabase();
    await prisma.audibleWarning.updateMany({ data: { createdAt: new Date(Date.now() - 61_000) } });
    const unanswered = await send('mom', U.child).expect(201);
    await ack('child', unanswered.body.warningId, 'unanswered').expect(201);
    const repeated = await ack('child', unanswered.body.warningId, 'unanswered').expect(201);
    expect(repeated.body.duplicate).toBe(true);
    expect(await prisma.alert.count({ where: { audibleWarningId: unanswered.body.warningId } })).toBe(1);
    expect(familyNotificationSpy).toHaveBeenCalledTimes(1);
  });

  it('validates input and does not accept client-controlled sender/family fields', async () => {
    await request(app.getHttpServer())
      .post('/locations/audible-warning')
      .send({ targetUserId: U.child, eventId: randomUUID() })
      .expect(401);
    await send('mom', U.child, 'invalid-event-id').expect(400);
    await request(app.getHttpServer())
      .post('/locations/audible-warning')
      .set('Authorization', `Bearer ${tokens.mom}`)
      .send({ targetUserId: U.child, eventId: randomUUID(), senderId: U.crossGuardian, familyId: FAMILY_B })
      .expect(400);
  });

  it('keeps the committed warning when push delivery fails', async () => {
    pushSpy.mockRejectedValueOnce(new Error('simulated push failure'));
    const response = await send('mom', U.child).expect(201);
    expect(await prisma.audibleWarning.count({ where: { id: response.body.warningId } })).toBe(1);
  });
});
