import {
  ConflictException,
  HttpException,
  UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';

describe('AuthService security flows', () => {
  const future = () => new Date(Date.now() + 60_000);

  function setup() {
    const prisma = {
      user: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
      session: {
        create: jest.fn().mockResolvedValue({ id: 's1' }),
        findUnique: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      emailVerification: {
        findUnique: jest.fn(),
        upsert: jest.fn(),
        update: jest.fn(),
        delete: jest.fn().mockResolvedValue(undefined),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: any) => callback(prisma));
    const jwt = { sign: jest.fn().mockReturnValue('signed-access-token') };
    const users = {
      findOne: jest.fn().mockResolvedValue({ id: 'u1', role: 'guardian' }),
    };
    const mail = {
      sendVerificationCodeEmail: jest.fn().mockResolvedValue(undefined),
      sendResetPasswordEmail: jest.fn().mockResolvedValue(undefined),
    };
    return {
      service: new AuthService(
        prisma as any,
        jwt as any,
        users as any,
        mail as any,
      ),
      prisma,
      jwt,
      users,
      mail,
    };
  }

  it('normalizes email, hashes registration OTP and sends only the plaintext code by mail', async () => {
    const { service, prisma, mail } = setup();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.emailVerification.findUnique.mockResolvedValue(null);
    prisma.emailVerification.upsert.mockResolvedValue({});

    await service.sendVerificationCode('  USER@Example.COM ');

    const mailedCode = mail.sendVerificationCodeEmail.mock.calls[0][1];
    const storedHash =
      prisma.emailVerification.upsert.mock.calls[0][0].create.code;
    expect(mail.sendVerificationCodeEmail).toHaveBeenCalledWith(
      'user@example.com',
      expect.stringMatching(/^\d{6}$/),
    );
    expect(storedHash).not.toBe(mailedCode);
    await expect(bcrypt.compare(mailedCode, storedHash)).resolves.toBe(true);
  });

  it('does not send another OTP while an existing registration code is valid', async () => {
    const { service, prisma, mail } = setup();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.emailVerification.findUnique.mockResolvedValue({
      expiresAt: future(),
    });

    const result = await service.sendVerificationCode('user@example.com');

    expect(result.codeSent).toBe(false);
    expect(mail.sendVerificationCodeEmail).not.toHaveBeenCalled();
  });

  it('rejects registration when the address already exists', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({ id: 'existing' });
    await expect(
      service.register({ email: 'x@y.com' } as any),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('blocks registration after the fifth invalid OTP attempt', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.emailVerification.findUnique.mockResolvedValue({
      code: await bcrypt.hash('111111', 4),
      expiresAt: future(),
      failedAttempts: 4,
      blockedUntil: null,
    });

    await expect(
      service.register({ email: 'x@y.com', code: '222222' } as any),
    ).rejects.toMatchObject({ status: 429 });
    expect(prisma.emailVerification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failedAttempts: 5,
          blockedUntil: expect.any(Date),
        }),
      }),
    );
  });

  it('creates a user only after a valid registration OTP and deletes the OTP record', async () => {
    const { service, prisma, jwt, users } = setup();
    const code = '123456';
    prisma.user.findUnique.mockResolvedValue(null);
    prisma.emailVerification.findUnique.mockResolvedValue({
      code: await bcrypt.hash(code, 4),
      expiresAt: future(),
      failedAttempts: 0,
      blockedUntil: null,
    });
    prisma.user.create.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
    });

    const result = await service.register({
      email: 'USER@example.com',
      password: 'password123',
      name: 'User',
      code,
    });

    expect(prisma.user.create).toHaveBeenCalled();
    expect(prisma.emailVerification.delete).toHaveBeenCalledWith({
      where: { email: 'user@example.com' },
    });
    expect(jwt.sign).toHaveBeenCalledWith(
      { sub: 'u1', email: 'user@example.com', sid: 's1', typ: 'access' },
      { expiresIn: '15m' },
    );
    expect(users.findOne).toHaveBeenCalledWith('u1');
    expect(result.token).toBe('signed-access-token');
    expect(result.accessToken).toBe('signed-access-token');
    expect(result.refreshToken).toEqual(expect.any(String));
  });

  it('uses the same generic login error for missing user and wrong password', async () => {
    const first = setup();
    first.prisma.user.findUnique.mockResolvedValue(null);
    await expect(
      first.service.login({ email: 'x@y.com', password: 'x' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);

    const second = setup();
    second.prisma.user.findUnique.mockResolvedValue({
      passwordHash: await bcrypt.hash('correct', 4),
      role: 'guardian',
    });
    await expect(
      second.service.login({ email: 'x@y.com', password: 'wrong' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('does not reveal whether a password-reset email exists', async () => {
    const { service, prisma, mail } = setup();
    prisma.user.findUnique.mockResolvedValue(null);
    const result = await service.forgotPassword('missing@example.com');
    expect(result.message).toContain('kayıtlıysa');
    expect(mail.sendResetPasswordEmail).not.toHaveBeenCalled();
  });

  it('blocks the fifth invalid password reset OTP attempt', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      resetOtpCode: await bcrypt.hash('111111', 4),
      resetOtpExpiresAt: future(),
      resetOtpFailedAttempts: 4,
      resetOtpBlockedUntil: null,
    });
    await expect(
      service.resetPassword({
        email: 'x@y.com',
        code: '222222',
        newPassword: 'new-password',
      }),
    ).rejects.toBeInstanceOf(HttpException);
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          resetOtpFailedAttempts: 5,
          resetOtpBlockedUntil: expect.any(Date),
        }),
      }),
    );
  });

  it('changes the password and clears OTP state after a valid reset code', async () => {
    const { service, prisma } = setup();
    const code = '654321';
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      resetOtpCode: await bcrypt.hash(code, 4),
      resetOtpExpiresAt: future(),
      resetOtpFailedAttempts: 0,
      resetOtpBlockedUntil: null,
    });
    await service.resetPassword({
      email: 'x@y.com',
      code,
      newPassword: 'new-password',
    });
    const data = prisma.user.update.mock.calls[0][0].data;
    expect(data.passwordHash).not.toBe('new-password');
    expect(data).toMatchObject({
      resetOtpCode: null,
      resetOtpExpiresAt: null,
      resetOtpFailedAttempts: 0,
    });
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', revokedAt: null },
      }),
    );
  });

  it('stores only a hash of the refresh token at login', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      passwordHash: await bcrypt.hash('correct-password', 4),
      role: 'guardian',
      memberships: [],
    });

    const result = await service.login({
      email: 'user@example.com',
      password: 'correct-password',
    });

    const storedHash =
      prisma.session.create.mock.calls[0][0].data.refreshTokenHash;
    expect(storedHash).not.toBe(result.refreshToken);
    expect(storedHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.accessTokenExpiresIn).toBe(900);
  });

  it('rotates a valid refresh token and revokes the previous session', async () => {
    const { service, prisma } = setup();
    prisma.session.findUnique.mockResolvedValue({
      id: 'old-session',
      userId: 'u1',
      tokenFamilyId: 'family-phone-1',
      deviceId: 'phone-1',
      revokedAt: null,
      replacedByTokenHash: null,
      expiresAt: future(),
      user: { id: 'u1', email: 'user@example.com' },
    });
    prisma.session.create.mockResolvedValue({ id: 'new-session' });

    const result = await service.refresh('old-refresh-token');

    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'old-session', revokedAt: null },
        data: expect.objectContaining({
          revokedAt: expect.any(Date),
          replacedByTokenHash: expect.any(String),
        }),
      }),
    );
    expect(prisma.session.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: 'u1',
          tokenFamilyId: 'family-phone-1',
          deviceId: 'phone-1',
        }),
      }),
    );
    expect(result.refreshToken).not.toBe('old-refresh-token');
  });

  it('returns a conflict without revoking sessions during the refresh grace period', async () => {
    const { service, prisma } = setup();
    prisma.session.findUnique.mockResolvedValue({
      id: 'old-session',
      userId: 'u1',
      tokenFamilyId: 'family-phone-1',
      revokedAt: new Date(),
      replacedByTokenHash: 'next-token-hash',
      expiresAt: future(),
      user: { id: 'u1', email: 'user@example.com' },
    });

    await expect(service.refresh('stolen-old-token')).rejects.toMatchObject({
      status: 409,
      response: expect.objectContaining({
        code: 'REFRESH_ALREADY_ROTATED',
        retryAfterMs: expect.any(Number),
      }),
    });
    expect(prisma.session.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tokenFamilyId: 'family-phone-1' }),
      }),
    );
  });

  it('revokes only the affected device token family after the grace period', async () => {
    const { service, prisma } = setup();
    prisma.session.findUnique.mockResolvedValue({
      id: 'old-session',
      userId: 'u1',
      tokenFamilyId: 'family-phone-1',
      revokedAt: new Date(Date.now() - 10_000),
      replacedByTokenHash: 'next-token-hash',
      expiresAt: future(),
      user: { id: 'u1', email: 'user@example.com' },
    });

    await expect(service.refresh('stolen-old-token')).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          userId: 'u1',
          tokenFamilyId: 'family-phone-1',
          revokedAt: null,
        },
      }),
    );
  });

  it('replaces an existing active session for the same device at login', async () => {
    const { service, prisma } = setup();
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'user@example.com',
      passwordHash: await bcrypt.hash('correct-password', 4),
      role: 'guardian',
      memberships: [],
    });

    await service.login({
      email: 'user@example.com',
      password: 'correct-password',
      deviceId: 'phone-1',
    });

    expect(prisma.session.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', deviceId: 'phone-1', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it('can revoke the current session or all sessions', async () => {
    const { service, prisma } = setup();
    await service.logout('s1');
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 's1', revokedAt: null },
      }),
    );

    await service.logoutAll('u1');
    expect(prisma.session.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'u1', revokedAt: null },
      }),
    );
  });
});
