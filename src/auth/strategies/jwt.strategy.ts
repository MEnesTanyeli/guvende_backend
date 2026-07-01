import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        configService.get<string>('JWT_SECRET') ||
        'guvende_gizli_anahtar_uretimde_degistirin',
    });
  }

  async validate(payload: {
    sub: string;
    email: string;
    sid?: string;
    typ?: string;
  }) {
    if (!payload.sid || payload.typ !== 'access') {
      throw new UnauthorizedException('Geçersiz veya eski oturum tokenı.');
    }

    const session = await this.prisma.session.findFirst({
      where: {
        id: payload.sid,
        userId: payload.sub,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
      select: { id: true },
    });

    if (!session) {
      throw new UnauthorizedException('Oturum kapatılmış veya süresi dolmuş.');
    }

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Geçersiz kimlik bilgileri.');
    }

    return { ...user, sessionId: session.id };
  }
}
