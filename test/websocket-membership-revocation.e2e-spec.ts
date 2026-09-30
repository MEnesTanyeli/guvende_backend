import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { MemberType } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { io, Socket } from 'socket.io-client';
import { AddressInfo } from 'net';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { validateTestDatabaseEnvironment } from '../src/testing/test-database-safety';
import { LocationsGateway } from '../src/locations/locations.gateway';

const PASSWORD = 'WebSocket-Revocation-E2E-Password-2026';
const FAMILIES = {
  a: '30000000-0000-4000-8000-000000000001',
  b: '30000000-0000-4000-8000-000000000002',
} as const;
const USERS = {
  ownerA: { id: '30000000-0000-4000-8000-000000000011', email: 'ws-owner-a@guvende.test', role: 'guardian' },
  childB: { id: '30000000-0000-4000-8000-000000000012', email: 'ws-child-b@guvende.test', role: 'child' },
  guardianC: { id: '30000000-0000-4000-8000-000000000013', email: 'ws-guardian-c@guvende.test', role: 'guardian' },
  ownerB: { id: '30000000-0000-4000-8000-000000000014', email: 'ws-owner-b@guvende.test', role: 'guardian' },
} as const;
const USER_IDS = Object.values(USERS).map((user) => user.id);

type LoginUser = (typeof USERS)[keyof typeof USERS];

describe('WebSocket membership revocation E2E', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let appUrl: string;
  let passwordHash: string;
  let loginAttempt = 0;
  const sockets = new Set<Socket>();

  async function assertSafeDatabase(): Promise<void> {
    validateTestDatabaseEnvironment(process.env);
    const result = await prisma.$queryRaw<Array<{ database: string }>>`
      SELECT current_database() AS database
    `;
    if (result[0]?.database !== 'guvende_test') {
      throw new Error('WebSocket E2E fixture islemi guvende_test disinda reddedildi.');
    }
  }

  async function removeFixtures(): Promise<void> {
    await assertSafeDatabase();
    await prisma.user.deleteMany({ where: { id: { in: USER_IDS } } });
  }

  async function login(user: LoginUser): Promise<string> {
    loginAttempt += 1;
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .set('X-Forwarded-For', `198.51.100.${loginAttempt}`)
      .send({
        email: user.email,
        password: PASSWORD,
        ...(user.role === 'child' ? { deviceId: `ws-device-${loginAttempt}` } : {}),
      })
      .expect(201);
    return response.body.accessToken as string;
  }

  async function waitFor(condition: () => boolean, error: string): Promise<void> {
    const deadline = Date.now() + 2_000;
    while (!condition()) {
      if (Date.now() >= deadline) throw new Error(error);
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  async function connect(token: string, userId: string): Promise<Socket> {
    const socket = io(appUrl, {
      transports: ['websocket'],
      auth: { token: `Bearer ${token}` },
      forceNew: true,
    });
    sockets.add(socket);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket connection timed out.')), 2_000);
      socket.once('connect', () => { clearTimeout(timer); resolve(); });
      socket.once('connect_error', (error) => { clearTimeout(timer); reject(error); });
    });
    const gateway = app.get(LocationsGateway);
    await waitFor(
      () => gateway.isUserConnected(userId),
      'Gateway did not complete JWT/session authentication.',
    );
    return socket;
  }

  async function join(socket: Socket, familyId: string): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      socket.timeout(2_000).emit('joinFamily', { familyId }, (error: Error | null, response: Record<string, unknown>) => {
        if (error) reject(error);
        else resolve(response);
      });
    });
  }

  function nextLocation(socket: Socket): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Expected location_update was not received.')), 1_000);
      socket.once('location_update', (payload) => { clearTimeout(timer); resolve(payload as Record<string, unknown>); });
    });
  }

  function locationWasNotReceived(socket: Socket): Promise<boolean> {
    return new Promise((resolve) => {
      const received = () => resolve(false);
      socket.once('location_update', received);
      setTimeout(() => { socket.off('location_update', received); resolve(true); }, 500);
    });
  }

  async function publishChildLocation(token: string, latitude: number): Promise<void> {
    await request(app.getHttpServer())
      .post('/locations')
      .set('Authorization', `Bearer ${token}`)
      .send({ latitude, longitude: 29, recordedAt: new Date().toISOString() })
      .expect(201);
  }

  async function removeMember(token: string, familyId: string): Promise<void> {
    await request(app.getHttpServer())
      .delete(`/families/${familyId}/members/${USERS.guardianC.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
  }

  beforeAll(async () => {
    validateTestDatabaseEnvironment(process.env);
    const moduleFixture: TestingModule = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleFixture.createNestApplication();
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address() as AddressInfo;
    appUrl = `http://127.0.0.1:${address.port}`;
    prisma = app.get(PrismaService);
    await assertSafeDatabase();
    passwordHash = await bcrypt.hash(PASSWORD, 10);
  });

  beforeEach(async () => {
    await removeFixtures();
    const trialEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1_000);
    await prisma.user.createMany({ data: Object.values(USERS).map((user) => ({ ...user, name: user.email.split('@')[0], passwordHash, trialEndsAt })) });
    await prisma.family.createMany({ data: [
      { id: FAMILIES.a, name: 'WebSocket Family A', ownerId: USERS.ownerA.id },
      { id: FAMILIES.b, name: 'WebSocket Family B', ownerId: USERS.ownerB.id },
    ] });
    await prisma.familyMember.createMany({ data: [
      { familyId: FAMILIES.a, userId: USERS.ownerA.id, memberType: MemberType.guardian },
      { familyId: FAMILIES.a, userId: USERS.childB.id, memberType: MemberType.child },
      { familyId: FAMILIES.a, userId: USERS.guardianC.id, memberType: MemberType.guardian },
      { familyId: FAMILIES.b, userId: USERS.ownerB.id, memberType: MemberType.guardian, guardianTrackingEnabled: true },
      { familyId: FAMILIES.b, userId: USERS.guardianC.id, memberType: MemberType.guardian, guardianTrackingEnabled: true },
    ] });
  });

  afterEach(async () => {
    await Promise.all([...sockets].map(async (socket) => {
      if (!socket.connected) return;
      await new Promise<void>((resolve) => {
        socket.once('disconnect', () => resolve());
        socket.disconnect();
      });
    }));
    sockets.clear();
    await removeFixtures();
  });

  afterAll(async () => { await app?.close(); });

  it('allows a current family member to join and receive a live location update', async () => {
    const [guardianToken, childToken] = await Promise.all([login(USERS.guardianC), login(USERS.childB)]);
    const socket = await connect(guardianToken, USERS.guardianC.id);
    expect(await join(socket, FAMILIES.a)).toEqual({ status: 'success' });
    const event = nextLocation(socket);
    await publishChildLocation(childToken, 41.01);
    expect((await event).userId).toBe(USERS.childB.id);
  });

  it('rejects a cross-family user joining Family A and does not deliver its data', async () => {
    const [outsiderToken, childToken] = await Promise.all([login(USERS.ownerB), login(USERS.childB)]);
    const socket = await connect(outsiderToken, USERS.ownerB.id);
    expect(await join(socket, FAMILIES.a)).toMatchObject({ status: 'error' });
    const noEvent = locationWasNotReceived(socket);
    await publishChildLocation(childToken, 41.02);
    expect(await noEvent).toBe(true);
  });

  it('does not deliver Family A events to an already joined socket after the member is kicked', async () => {
    const [ownerToken, guardianToken, childToken] = await Promise.all([login(USERS.ownerA), login(USERS.guardianC), login(USERS.childB)]);
    const socket = await connect(guardianToken, USERS.guardianC.id);
    expect(await join(socket, FAMILIES.a)).toEqual({ status: 'success' });
    await removeMember(ownerToken, FAMILIES.a);
    const noEvent = locationWasNotReceived(socket);
    await publishChildLocation(childToken, 41.03);
    expect(await noEvent).toBe(true);
  });

  it('does not deliver Family A events after a member leaves through the HTTP endpoint', async () => {
    const [guardianToken, childToken] = await Promise.all([login(USERS.guardianC), login(USERS.childB)]);
    const socket = await connect(guardianToken, USERS.guardianC.id);
    expect(await join(socket, FAMILIES.a)).toEqual({ status: 'success' });
    await request(app.getHttpServer()).delete(`/families/${FAMILIES.a}/leave`).set('Authorization', `Bearer ${guardianToken}`).expect(200);
    const noEvent = locationWasNotReceived(socket);
    await publishChildLocation(childToken, 41.04);
    expect(await noEvent).toBe(true);
  });

  it('does not deliver Family A events after proxy removal revokes the proxy membership', async () => {
    await prisma.familyMember.delete({ where: { familyId_userId: { familyId: FAMILIES.a, userId: USERS.guardianC.id } } });
    const [ownerToken, guardianToken, childToken] = await Promise.all([login(USERS.ownerA), login(USERS.guardianC), login(USERS.childB)]);
    await request(app.getHttpServer()).post('/users/proxy').set('Authorization', `Bearer ${ownerToken}`).send({ email: USERS.guardianC.email }).expect(201);
    const socket = await connect(guardianToken, USERS.guardianC.id);
    expect(await join(socket, FAMILIES.a)).toEqual({ status: 'success' });
    await request(app.getHttpServer()).patch('/users/proxy/remove').set('Authorization', `Bearer ${ownerToken}`).expect(200);
    const noEvent = locationWasNotReceived(socket);
    await publishChildLocation(childToken, 41.05);
    expect(await noEvent).toBe(true);
  });

  it('revokes Family A from every active socket for the removed member', async () => {
    const [ownerToken, guardianToken, childToken] = await Promise.all([login(USERS.ownerA), login(USERS.guardianC), login(USERS.childB)]);
    const [firstSocket, secondSocket] = await Promise.all([
      connect(guardianToken, USERS.guardianC.id),
      connect(guardianToken, USERS.guardianC.id),
    ]);
    expect(await join(firstSocket, FAMILIES.a)).toEqual({ status: 'success' });
    expect(await join(secondSocket, FAMILIES.a)).toEqual({ status: 'success' });
    await removeMember(ownerToken, FAMILIES.a);
    const [firstNoEvent, secondNoEvent] = [
      locationWasNotReceived(firstSocket),
      locationWasNotReceived(secondSocket),
    ];
    await publishChildLocation(childToken, 41.055);
    await expect(Promise.all([firstNoEvent, secondNoEvent])).resolves.toEqual([
      true,
      true,
    ]);
  });

  it('rejects rejoining Family A on the same socket after membership revocation', async () => {
    const [ownerToken, guardianToken] = await Promise.all([login(USERS.ownerA), login(USERS.guardianC)]);
    const socket = await connect(guardianToken, USERS.guardianC.id);
    expect(await join(socket, FAMILIES.a)).toEqual({ status: 'success' });
    await removeMember(ownerToken, FAMILIES.a);
    expect(await join(socket, FAMILIES.a)).toMatchObject({ status: 'error' });
  });

  it('revokes only Family A: Family B remains available on the same socket', async () => {
    const [ownerToken, guardianToken, childToken, ownerBToken] = await Promise.all([login(USERS.ownerA), login(USERS.guardianC), login(USERS.childB), login(USERS.ownerB)]);
    const socket = await connect(guardianToken, USERS.guardianC.id);
    expect(await join(socket, FAMILIES.a)).toEqual({ status: 'success' });
    expect(await join(socket, FAMILIES.b)).toEqual({ status: 'success' });
    await removeMember(ownerToken, FAMILIES.a);
    const noFamilyAEvent = locationWasNotReceived(socket);
    await publishChildLocation(childToken, 41.06);
    expect(await noFamilyAEvent).toBe(true);
    const familyBEvent = nextLocation(socket);
    await publishChildLocation(ownerBToken, 41.07);
    expect((await familyBEvent).latitude).toBe(41.07);
  });
});
