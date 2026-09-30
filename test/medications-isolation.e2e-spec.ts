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

const PASSWORD = 'Medication-Isolation-E2E-Password-2026';
const FAMILY_A_ID = '10000000-0000-4000-8000-000000000001';
const FAMILY_B_ID = '10000000-0000-4000-8000-000000000002';
const USERS = {
  guardianA: {
    id: '10000000-0000-4000-8000-000000000011',
    email: 'med-isolation-guardian-a@guvende.test',
    role: 'guardian',
  },
  childA: {
    id: '10000000-0000-4000-8000-000000000012',
    email: 'med-isolation-child-a@guvende.test',
    role: 'child',
  },
  childB: {
    id: '10000000-0000-4000-8000-000000000013',
    email: 'med-isolation-child-b@guvende.test',
    role: 'child',
  },
  childD: {
    id: '10000000-0000-4000-8000-000000000014',
    email: 'med-isolation-child-d@guvende.test',
    role: 'child',
  },
  elderA: {
    id: '10000000-0000-4000-8000-000000000015',
    email: 'med-isolation-elder-a@guvende.test',
    role: 'elder',
  },
  guardianB: {
    id: '10000000-0000-4000-8000-000000000016',
    email: 'med-isolation-guardian-b@guvende.test',
    role: 'guardian',
  },
  childC: {
    id: '10000000-0000-4000-8000-000000000017',
    email: 'med-isolation-child-c@guvende.test',
    role: 'child',
  },
} as const;
const USER_IDS = Object.values(USERS).map((user) => user.id);
const MISSING_USER_ID = '10000000-0000-4000-8000-000000000099';

const MEDICATIONS = {
  childA: 'Child A private medication',
  childB: 'Child B private medication',
  childD: 'Child D private medication',
  elderA: 'Elder A private medication',
  childC: 'Child C private medication',
} as const;

describe('Medications cross-user isolation E2E', () => {
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
        'Medication E2E fixture islemi reddedildi: hedef guvende_test degil.',
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
          ? { deviceId: `med-isolation-device-${user.id.slice(-2)}` }
          : {}),
      })
      .expect(201);
  }

  async function medicationRequest(accessToken: string, targetUserId: string) {
    return request(app.getHttpServer())
      .get(`/medications/user/${targetUserId}`)
      .set('Authorization', `Bearer ${accessToken}`);
  }

  function expectOnlyMedication(
    response: request.Response,
    medicationName: string,
  ) {
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ medicationName });
    for (const otherMedication of Object.values(MEDICATIONS)) {
      if (otherMedication !== medicationName) {
        expect(JSON.stringify(response.body)).not.toContain(otherMedication);
      }
    }
  }

  function expectForbiddenWithoutMedication(
    response: request.Response,
    medicationName: string,
  ) {
    expect({
      status: response.status,
      targetMedicationExposed: JSON.stringify(response.body).includes(
        medicationName,
      ),
    }).toEqual({ status: 403, targetMedicationExposed: false });
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
          id: FAMILY_A_ID,
          name: 'Medication Isolation Family A',
          ownerId: USERS.guardianA.id,
        },
        {
          id: FAMILY_B_ID,
          name: 'Medication Isolation Family B',
          ownerId: USERS.guardianB.id,
        },
      ],
    });
    await prisma.familyMember.createMany({
      data: [
        {
          familyId: FAMILY_A_ID,
          userId: USERS.guardianA.id,
          memberType: MemberType.guardian,
        },
        {
          familyId: FAMILY_A_ID,
          userId: USERS.childA.id,
          memberType: MemberType.child,
        },
        {
          familyId: FAMILY_A_ID,
          userId: USERS.childB.id,
          memberType: MemberType.child,
        },
        {
          familyId: FAMILY_A_ID,
          userId: USERS.childD.id,
          memberType: MemberType.child,
        },
        {
          familyId: FAMILY_A_ID,
          userId: USERS.elderA.id,
          memberType: MemberType.elder,
        },
        {
          familyId: FAMILY_B_ID,
          userId: USERS.guardianB.id,
          memberType: MemberType.guardian,
        },
        {
          familyId: FAMILY_B_ID,
          userId: USERS.childC.id,
          memberType: MemberType.child,
        },
      ],
    });
    await prisma.medicationReminder.createMany({
      data: [
        {
          userId: USERS.childA.id,
          medicationName: MEDICATIONS.childA,
          dosage: '1 tablet',
          time: '08:00',
        },
        {
          userId: USERS.childB.id,
          medicationName: MEDICATIONS.childB,
          dosage: '1 tablet',
          time: '09:00',
        },
        {
          userId: USERS.childD.id,
          medicationName: MEDICATIONS.childD,
          dosage: '1 tablet',
          time: '10:00',
        },
        {
          userId: USERS.elderA.id,
          medicationName: MEDICATIONS.elderA,
          dosage: '1 tablet',
          time: '11:00',
        },
        {
          userId: USERS.childC.id,
          medicationName: MEDICATIONS.childC,
          dosage: '1 tablet',
          time: '12:00',
        },
      ],
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

  it('allows a child to read only their own medications', async () => {
    const requester = await login(USERS.childA);
    const response = await medicationRequest(
      requester.body.accessToken,
      USERS.childA.id,
    );

    expect(response.status).toBe(200);
    expectOnlyMedication(response, MEDICATIONS.childA);
  });

  it('allows a guardian to read a same-family child medications', async () => {
    const requester = await login(USERS.guardianA);
    const response = await medicationRequest(
      requester.body.accessToken,
      USERS.childB.id,
    );

    expect(response.status).toBe(200);
    expectOnlyMedication(response, MEDICATIONS.childB);
  });

  it('allows a guardian to read a same-family elder medications', async () => {
    const requester = await login(USERS.guardianA);
    const response = await medicationRequest(
      requester.body.accessToken,
      USERS.elderA.id,
    );

    expect(response.status).toBe(200);
    expectOnlyMedication(response, MEDICATIONS.elderA);
  });

  it('rejects a child reading another same-family child medications', async () => {
    const requester = await login(USERS.childB);
    const response = await medicationRequest(
      requester.body.accessToken,
      USERS.childD.id,
    );

    expectForbiddenWithoutMedication(response, MEDICATIONS.childD);
  });

  it('rejects a child reading a same-family elder medications', async () => {
    const requester = await login(USERS.childB);
    const response = await medicationRequest(
      requester.body.accessToken,
      USERS.elderA.id,
    );

    expectForbiddenWithoutMedication(response, MEDICATIONS.elderA);
  });

  it('rejects an elder reading a same-family child medications', async () => {
    const requester = await login(USERS.elderA);
    const response = await medicationRequest(
      requester.body.accessToken,
      USERS.childB.id,
    );

    expectForbiddenWithoutMedication(response, MEDICATIONS.childB);
  });

  it('rejects a guardian reading a child medications in another family', async () => {
    const requester = await login(USERS.guardianA);
    const response = await medicationRequest(
      requester.body.accessToken,
      USERS.childC.id,
    );

    expectForbiddenWithoutMedication(response, MEDICATIONS.childC);
  });

  it('rejects a child reading a member medications in another family', async () => {
    const requester = await login(USERS.childB);
    const response = await medicationRequest(
      requester.body.accessToken,
      USERS.childC.id,
    );

    expectForbiddenWithoutMedication(response, MEDICATIONS.childC);
  });

  it('returns an empty list for an unknown target without disclosing target existence', async () => {
    const requester = await login(USERS.guardianA);
    const response = await medicationRequest(
      requester.body.accessToken,
      MISSING_USER_ID,
    );

    // Current contract uses the same 200/[] response as an existing user with no active reminders.
    expect(response.status).toBe(200);
    expect(response.body).toEqual([]);
    expect(JSON.stringify(response.body)).not.toContain(MEDICATIONS.childA);
    expect(JSON.stringify(response.body)).not.toContain(MEDICATIONS.childC);
  });
});
