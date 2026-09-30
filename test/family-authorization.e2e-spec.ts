import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { App } from 'supertest/types';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { AlertType, MemberType } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/common/configure-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { validateTestDatabaseEnvironment } from '../src/testing/test-database-safety';

const PASSWORD = 'Family-E2E-Password-2026';
const USERS = {
  ownerA: {
    id: '00000000-0000-4000-8000-0000000000c1',
    email: 'family-owner-a@guvende.test',
    role: 'guardian',
  },
  guardianA: {
    id: '00000000-0000-4000-8000-0000000000c2',
    email: 'family-guardian-a@guvende.test',
    role: 'guardian',
  },
  childA: {
    id: '00000000-0000-4000-8000-0000000000c3',
    email: 'family-child-a@guvende.test',
    role: 'child',
  },
  elderA: {
    id: '00000000-0000-4000-8000-0000000000c4',
    email: 'family-elder-a@guvende.test',
    role: 'elder',
  },
  ownerB: {
    id: '00000000-0000-4000-8000-0000000000c5',
    email: 'family-owner-b@guvende.test',
    role: 'guardian',
  },
  attacker: {
    id: '00000000-0000-4000-8000-0000000000c6',
    email: 'family-attacker@guvende.test',
    role: 'child',
  },
} as const;
const USER_IDS = Object.values(USERS).map((user) => user.id);

describe('Family membership and authorization E2E', () => {
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
      throw new Error('Family E2E fixture islemi reddedildi: hedef guvende_test degil.');
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
          ? { deviceId: `device-${user.id.slice(-2)}` }
          : {}),
      })
      .expect(201);
  }

  async function createFamily(accessToken: string, name: string) {
    return request(app.getHttpServer())
      .post('/families')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name })
      .expect(201);
  }

  function joinFamily(
    accessToken: string,
    inviteCode: string,
    extraBody: Record<string, unknown> = {},
  ) {
    return request(app.getHttpServer())
      .post('/families/join')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        inviteCode,
        ...extraBody,
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
    await prisma.user.createMany({
      data: Object.values(USERS).map((user) => ({
        id: user.id,
        name: user.email.split('@')[0],
        email: user.email,
        role: user.role,
        passwordHash,
        trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      })),
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

  it('creates a family with ownerId and an owner guardian membership', async () => {
    const owner = await login(USERS.ownerA);
    const response = await createFamily(owner.body.accessToken, 'Family E2E A');

    const family = await prisma.family.findUniqueOrThrow({
      where: { id: response.body.id },
    });
    const membership = await prisma.familyMember.findUniqueOrThrow({
      where: {
        familyId_userId: { familyId: family.id, userId: USERS.ownerA.id },
      },
    });
    expect(family.ownerId).toBe(USERS.ownerA.id);
    expect(membership.memberType).toBe(MemberType.guardian);
    expect(membership.permissions).toEqual(expect.arrayContaining(['owner', 'all']));
  });

  it('allows the owner to delete the family and cascades memberships', async () => {
    const owner = await login(USERS.ownerA);
    const family = await createFamily(owner.body.accessToken, 'Owner Delete');
    const response = await request(app.getHttpServer())
      .delete(`/families/${family.body.id}`)
      .set('Authorization', `Bearer ${owner.body.accessToken}`);

    expect(response.status).toBe(200);
    expect(await prisma.family.findUnique({ where: { id: family.body.id } })).toBeNull();
    expect(
      await prisma.familyMember.count({ where: { familyId: family.body.id } }),
    ).toBe(0);
  });

  it('rejects a non-owner guardian deleting the family and preserves both families', async () => {
    const ownerA = await login(USERS.ownerA);
    const guardian = await login(USERS.guardianA);
    const ownerB = await login(USERS.ownerB);
    const familyA = await createFamily(ownerA.body.accessToken, 'Guardian Delete A');
    const familyB = await createFamily(ownerB.body.accessToken, 'Guardian Delete B');
    await joinFamily(
      guardian.body.accessToken,
      familyA.body.inviteCode,
    ).expect(201);

    const response = await request(app.getHttpServer())
      .delete(`/families/${familyA.body.id}`)
      .set('Authorization', `Bearer ${guardian.body.accessToken}`);
    const state = {
      status: response.status,
      familyAExists: !!(await prisma.family.findUnique({ where: { id: familyA.body.id } })),
      ownerMembershipExists: !!(await prisma.familyMember.findUnique({
        where: {
          familyId_userId: {
            familyId: familyA.body.id,
            userId: USERS.ownerA.id,
          },
        },
      })),
      guardianMembershipExists: !!(await prisma.familyMember.findUnique({
        where: {
          familyId_userId: {
            familyId: familyA.body.id,
            userId: USERS.guardianA.id,
          },
        },
      })),
      familyBExists: !!(await prisma.family.findUnique({ where: { id: familyB.body.id } })),
    };

    expect(state).toEqual({
      status: 403,
      familyAExists: true,
      ownerMembershipExists: true,
      guardianMembershipExists: true,
      familyBExists: true,
    });
  });

  it('rejects a user from another family deleting the family', async () => {
    const ownerA = await login(USERS.ownerA);
    const ownerB = await login(USERS.ownerB);
    const familyA = await createFamily(ownerA.body.accessToken, 'Cross Family Delete A');
    const familyB = await createFamily(ownerB.body.accessToken, 'Cross Family Delete B');

    const response = await request(app.getHttpServer())
      .delete(`/families/${familyA.body.id}`)
      .set('Authorization', `Bearer ${ownerB.body.accessToken}`);

    expect(response.status).toBe(403);
    expect(await prisma.family.findUnique({ where: { id: familyA.body.id } })).not.toBeNull();
    expect(await prisma.family.findUnique({ where: { id: familyB.body.id } })).not.toBeNull();
    expect(
      await prisma.familyMember.findUnique({
        where: {
          familyId_userId: {
            familyId: familyA.body.id,
            userId: USERS.ownerA.id,
          },
        },
      }),
    ).not.toBeNull();
  });

  it.each([
    ['child', USERS.childA],
    ['elder', USERS.elderA],
  ] as const)('rejects a %s deleting a family', async (_label, member) => {
    const owner = await login(USERS.ownerA);
    const memberLogin = await login(member);
    const family = await createFamily(owner.body.accessToken, `${member.role} Delete`);
    await joinFamily(memberLogin.body.accessToken, family.body.inviteCode).expect(201);

    const response = await request(app.getHttpServer())
      .delete(`/families/${family.body.id}`)
      .set('Authorization', `Bearer ${memberLogin.body.accessToken}`);
    expect(response.status).toBe(403);
    expect(await prisma.family.findUnique({ where: { id: family.body.id } })).not.toBeNull();
  });

  it('rejects a child-supplied guardian role and derives child on a valid join', async () => {
    const owner = await login(USERS.ownerA);
    const attacker = await login(USERS.attacker);
    const family = await createFamily(owner.body.accessToken, 'Self Guardian');
    const response = await joinFamily(
      attacker.body.accessToken,
      family.body.inviteCode,
      { memberType: MemberType.guardian },
    );
    const rejectedMembership = await prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId: family.body.id,
          userId: USERS.attacker.id,
        },
      },
    });

    expect({
      status: response.status,
      memberType: rejectedMembership?.memberType ?? null,
    }).toEqual({
      status: 400,
      memberType: null,
    });

    await joinFamily(attacker.body.accessToken, family.body.inviteCode).expect(201);
    const membership = await prisma.familyMember.findUniqueOrThrow({
      where: {
        familyId_userId: {
          familyId: family.body.id,
          userId: USERS.attacker.id,
        },
      },
    });
    expect(membership.memberType).toBe(MemberType.child);
  });

  it.each([
    ['elder', USERS.elderA, MemberType.elder],
    ['guardian', USERS.guardianA, MemberType.guardian],
  ] as const)(
    'derives %s membership from the authenticated global profile',
    async (_label, member, expectedMemberType) => {
      const owner = await login(USERS.ownerA);
      const joiningUser = await login(member);
      const family = await createFamily(owner.body.accessToken, `${member.role} Join`);

      await joinFamily(joiningUser.body.accessToken, family.body.inviteCode).expect(201);
      const membership = await prisma.familyMember.findUniqueOrThrow({
        where: {
          familyId_userId: {
            familyId: family.body.id,
            userId: member.id,
          },
        },
      });
      expect(membership.memberType).toBe(expectedMemberType);
    },
  );

  it('does not expose an API for changing a family member role', async () => {
    const owner = await login(USERS.ownerA);
    const child = await login(USERS.childA);
    const family = await createFamily(owner.body.accessToken, 'Immutable Role');
    await joinFamily(child.body.accessToken, family.body.inviteCode).expect(201);

    const response = await request(app.getHttpServer())
      .patch(`/families/${family.body.id}/members/role`)
      .set('Authorization', `Bearer ${owner.body.accessToken}`)
      .send({ targetUserId: USERS.childA.id, memberType: MemberType.guardian });
    const membership = await prisma.familyMember.findUniqueOrThrow({
      where: {
        familyId_userId: {
          familyId: family.body.id,
          userId: USERS.childA.id,
        },
      },
    });

    expect(response.status).toBe(404);
    expect(membership.memberType).toBe(MemberType.child);
  });

  it('accepts an invite code but rejects direct family UUID as an invitation', async () => {
    const owner = await login(USERS.ownerA);
    const child = await login(USERS.childA);
    const attacker = await login(USERS.attacker);
    const family = await createFamily(owner.body.accessToken, 'Invite Boundary');

    await joinFamily(child.body.accessToken, family.body.inviteCode).expect(201);
    const uuidAttempt = await joinFamily(attacker.body.accessToken, family.body.id);
    const attackerMembership = await prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId: family.body.id,
          userId: USERS.attacker.id,
        },
      },
    });
    expect({
      status: uuidAttempt.status,
      membershipCreated: !!attackerMembership,
    }).toEqual({ status: 404, membershipCreated: false });
  });

  it('rejects an invalid invite code without creating a membership', async () => {
    const owner = await login(USERS.ownerA);
    const child = await login(USERS.childA);
    const family = await createFamily(owner.body.accessToken, 'Invalid Invite');

    const response = await joinFamily(
      child.body.accessToken,
      'NOT-A-REAL-INVITE-CODE',
    );
    const membership = await prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId: family.body.id,
          userId: USERS.childA.id,
        },
      },
    });

    expect(response.status).toBe(404);
    expect(response.body.message).toBe('Geçersiz aile davet kodu.');
    expect(membership).toBeNull();
  });

  it('isolates Family B details from authenticated Owner A', async () => {
    const ownerA = await login(USERS.ownerA);
    const ownerB = await login(USERS.ownerB);
    const familyA = await createFamily(ownerA.body.accessToken, 'Isolation A');
    const familyB = await createFamily(ownerB.body.accessToken, 'Isolation B');

    const response = await request(app.getHttpServer())
      .get(`/families/${familyB.body.id}`)
      .set('Authorization', `Bearer ${ownerA.body.accessToken}`);
    expect(response.status).toBe(403);
    expect(JSON.stringify(response.body)).not.toContain(familyB.body.inviteCode);
    expect(await prisma.family.findUnique({ where: { id: familyA.body.id } })).not.toBeNull();
    expect(await prisma.family.findUnique({ where: { id: familyB.body.id } })).not.toBeNull();
  });

  it('protects owner membership from guardian removal', async () => {
    const owner = await login(USERS.ownerA);
    const guardian = await login(USERS.guardianA);
    const child = await login(USERS.childA);
    const family = await createFamily(owner.body.accessToken, 'Owner Protection');
    await joinFamily(guardian.body.accessToken, family.body.inviteCode).expect(201);
    await joinFamily(child.body.accessToken, family.body.inviteCode).expect(201);

    const guardianRemoval = await request(app.getHttpServer())
      .delete(`/families/${family.body.id}/members/${USERS.ownerA.id}`)
      .set('Authorization', `Bearer ${guardian.body.accessToken}`);

    expect(guardianRemoval.status).toBe(403);
    const storedFamily = await prisma.family.findUniqueOrThrow({
      where: { id: family.body.id },
    });
    const ownerMembership = await prisma.familyMember.findUniqueOrThrow({
      where: {
        familyId_userId: {
          familyId: family.body.id,
          userId: USERS.ownerA.id,
        },
      },
    });
    expect(storedFamily.ownerId).toBe(USERS.ownerA.id);
    expect(ownerMembership.memberType).toBe(MemberType.guardian);
    expect(ownerMembership.permissions).toContain('owner');
  });

  it('validates Safe Zone boundaries before writing to PostgreSQL', async () => {
    const owner = await login(USERS.ownerA);
    const family = await createFamily(owner.body.accessToken, 'Safe Zone Validation');
    const endpoint = `/families/${family.body.id}/safe-zones`;
    for (const valid of [
      { name: 'a', latitude: -90, longitude: -180, radius: 10 },
      { name: 'x'.repeat(100), latitude: 90, longitude: 180, radius: 10000 },
    ]) {
      await request(app.getHttpServer()).post(endpoint)
        .set('Authorization', `Bearer ${owner.body.accessToken}`).send(valid).expect(201);
    }
    const invalid = [
      { name: 'z', latitude: 90.0001, longitude: 0, radius: 10 },
      { name: 'z', latitude: -90.0001, longitude: 0, radius: 10 },
      { name: 'z', latitude: 0, longitude: 180.0001, radius: 10 },
      { name: 'z', latitude: 0, longitude: -180.0001, radius: 10 },
      { name: 'z', latitude: 0, longitude: 0, radius: 9 },
      { name: 'z', latitude: 0, longitude: 0, radius: 10001 },
      { name: 'x'.repeat(101), latitude: 0, longitude: 0, radius: 10 },
      { name: 'z', latitude: 'NaN', longitude: 0, radius: 10 },
      { name: 'z', latitude: 0, longitude: 'Infinity', radius: 10 },
    ];
    for (const body of invalid) {
      await request(app.getHttpServer()).post(endpoint)
        .set('Authorization', `Bearer ${owner.body.accessToken}`).send(body).expect(400);
    }
    expect(await prisma.safeZone.count({ where: { familyId: family.body.id } })).toBe(2);
  });

  it('returns minimal Alert user data and preserves guardian authorization', async () => {
    const owner = await login(USERS.ownerA);
    const child = await login(USERS.childA);
    const family = await createFamily(owner.body.accessToken, 'Alert Projection');
    await joinFamily(child.body.accessToken, family.body.inviteCode).expect(201);
    await prisma.alert.create({ data: {
      familyId: family.body.id, userId: USERS.childA.id,
      type: AlertType.safe_zone_enter, title: 'Enter', message: 'Entered',
    } });
    const response = await request(app.getHttpServer())
      .get(`/families/${family.body.id}/alerts`)
      .set('Authorization', `Bearer ${owner.body.accessToken}`).expect(200);
    expect(response.body[0].user).toEqual({
      id: USERS.childA.id, name: USERS.childA.email.split('@')[0],
    });
    await request(app.getHttpServer()).get(`/families/${family.body.id}/alerts`)
      .set('Authorization', `Bearer ${child.body.accessToken}`).expect(403);
  });

  it('removes only Family A geofence state on member removal and does not reuse it after rejoin', async () => {
    const ownerA = await login(USERS.ownerA);
    const ownerB = await login(USERS.ownerB);
    const target = await login(USERS.guardianA);
    const familyA = await createFamily(ownerA.body.accessToken, 'State Family A');
    const familyB = await createFamily(ownerB.body.accessToken, 'State Family B');
    await joinFamily(target.body.accessToken, familyA.body.inviteCode).expect(201);
    await prisma.familyMember.create({ data: {
      familyId: familyB.body.id, userId: USERS.guardianA.id, memberType: MemberType.guardian,
    } });
    const [zoneA, zoneB] = await Promise.all([
      prisma.safeZone.create({ data: { familyId: familyA.body.id, name: 'A', latitude: 40, longitude: 30, radius: 100, createdBy: USERS.ownerA.id } }),
      prisma.safeZone.create({ data: { familyId: familyB.body.id, name: 'B', latitude: 41, longitude: 31, radius: 100, createdBy: USERS.ownerB.id } }),
    ]);
    await prisma.geofenceState.createMany({ data: [
      { userId: USERS.guardianA.id, safeZoneId: zoneA.id, status: 'inside' },
      { userId: USERS.guardianA.id, safeZoneId: zoneB.id, status: 'inside' },
    ] });

    await request(app.getHttpServer())
      .delete(`/families/${familyA.body.id}/members/${USERS.guardianA.id}`)
      .set('Authorization', `Bearer ${ownerA.body.accessToken}`).expect(200);
    expect(await prisma.geofenceState.findUnique({ where: { userId_safeZoneId: { userId: USERS.guardianA.id, safeZoneId: zoneA.id } } })).toBeNull();
    expect(await prisma.geofenceState.findUnique({ where: { userId_safeZoneId: { userId: USERS.guardianA.id, safeZoneId: zoneB.id } } })).not.toBeNull();

    await joinFamily(target.body.accessToken, familyA.body.inviteCode).expect(201);
    expect(await prisma.geofenceState.findUnique({ where: { userId_safeZoneId: { userId: USERS.guardianA.id, safeZoneId: zoneA.id } } })).toBeNull();
  });
});
