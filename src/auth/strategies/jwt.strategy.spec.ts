import { UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy session validation', () => {
  function setup() {
    const prisma = {
      session: { findFirst: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    const config = { get: jest.fn().mockReturnValue('test-secret') };
    return { strategy: new JwtStrategy(prisma as any, config as any), prisma };
  }

  it('rejects legacy access tokens without a session id', async () => {
    const { strategy } = setup();
    await expect(
      strategy.validate({ sub: 'u1', email: 'u@example.com' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a revoked or expired session', async () => {
    const { strategy, prisma } = setup();
    prisma.session.findFirst.mockResolvedValue(null);
    await expect(
      strategy.validate({
        sub: 'u1',
        email: 'u@example.com',
        sid: 's1',
        typ: 'access',
      }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('returns the user together with the verified session id', async () => {
    const { strategy, prisma } = setup();
    prisma.session.findFirst.mockResolvedValue({ id: 's1' });
    prisma.user.findUnique.mockResolvedValue({
      id: 'u1',
      email: 'u@example.com',
      role: 'guardian',
    });

    await expect(
      strategy.validate({
        sub: 'u1',
        email: 'u@example.com',
        sid: 's1',
        typ: 'access',
      }),
    ).resolves.toMatchObject({ id: 'u1', sessionId: 's1' });
  });
});
