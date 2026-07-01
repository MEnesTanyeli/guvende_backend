import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private usersService: UsersService,
    private mailService: MailService,
  ) {}

  async sendVerificationCode(email: string) {
    const cleanedEmail = email.toLowerCase().trim();
    const existingUser = await this.prisma.user.findUnique({
      where: { email: cleanedEmail },
    });
    if (existingUser) {
      throw new ConflictException('Bu e-posta adresi zaten kullanımda.');
    }

    const now = new Date();
    const verification = await this.prisma.emailVerification.findUnique({
      where: { email: cleanedEmail },
    });

    if (verification?.blockedUntil && verification.blockedUntil > now) {
      throw this.tooManyRequests(verification.blockedUntil);
    }

    if (verification && verification.expiresAt > now) {
      return {
        success: true,
        codeSent: false,
        message: 'Mevcut doğrulama kodunuz hâlâ geçerli.',
        expiresAt: verification.expiresAt,
        remainingSeconds: this.remainingSeconds(verification.expiresAt),
      };
    }

    const hourlyWindowStart =
      verification?.hourlyWindowStart &&
      now.getTime() - verification.hourlyWindowStart.getTime() < OTP_HOUR_MS
        ? verification.hourlyWindowStart
        : now;
    const dailyWindowStart =
      verification?.dailyWindowStart &&
      now.getTime() - verification.dailyWindowStart.getTime() < OTP_DAY_MS
        ? verification.dailyWindowStart
        : now;
    const hourlySendCount =
      hourlyWindowStart === verification?.hourlyWindowStart
        ? verification.hourlySendCount + 1
        : 1;
    const dailySendCount =
      dailyWindowStart === verification?.dailyWindowStart
        ? verification.dailySendCount + 1
        : 1;

    if (
      hourlySendCount > MAX_HOURLY_SENDS ||
      dailySendCount > MAX_DAILY_SENDS
    ) {
      const blockedUntil = new Date(now.getTime() + OTP_BLOCK_MS);
      if (verification) {
        await this.prisma.emailVerification.update({
          where: { email: cleanedEmail },
          data: { blockedUntil },
        });
      }
      throw this.tooManyRequests(blockedUntil);
    }

    const code = randomInt(100000, 1000000).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
    await this.prisma.emailVerification.upsert({
      where: { email: cleanedEmail },
      update: {
        code: codeHash,
        expiresAt,
        failedAttempts: 0,
        blockedUntil: null,
        lastSentAt: now,
        hourlyWindowStart,
        hourlySendCount,
        dailyWindowStart,
        dailySendCount,
      },
      create: {
        email: cleanedEmail,
        code: codeHash,
        expiresAt,
        lastSentAt: now,
        hourlyWindowStart: now,
        hourlySendCount: 1,
        dailyWindowStart: now,
        dailySendCount: 1,
      },
    });

    await this.mailService.sendVerificationCodeEmail(cleanedEmail, code);

    return {
      success: true,
      codeSent: true,
      message: 'Doğrulama kodu e-posta adresinize gönderildi.',
      expiresAt,
      remainingSeconds: this.remainingSeconds(expiresAt),
    };
  }

  async register(dto: RegisterDto) {
    const cleanedEmail = dto.email.toLowerCase().trim();

    const existingUser = await this.prisma.user.findUnique({
      where: { email: cleanedEmail },
    });

    if (existingUser) {
      throw new ConflictException('Bu e-posta adresi zaten kullanımda.');
    }

    // Doğrulama kodunu veritabanından çek ve doğrula
    const verification = await this.prisma.emailVerification.findUnique({
      where: { email: cleanedEmail },
    });

    const now = new Date();
    if (verification?.blockedUntil && verification.blockedUntil > now) {
      throw this.tooManyRequests(verification.blockedUntil);
    }

    if (!verification || verification.expiresAt < now) {
      throw new BadRequestException(
        'Doğrulama kodunun süresi dolmuş. Lütfen yeni bir kod isteyin.',
      );
    }

    const codeIsValid = await bcrypt.compare(dto.code, verification.code);
    if (!codeIsValid) {
      const failedAttempts = verification.failedAttempts + 1;
      const blockedUntil =
        failedAttempts >= MAX_FAILED_ATTEMPTS
          ? new Date(now.getTime() + OTP_BLOCK_MS)
          : null;
      await this.prisma.emailVerification.update({
        where: { email: cleanedEmail },
        data: { failedAttempts, blockedUntil },
      });
      if (blockedUntil) {
        throw this.tooManyRequests(blockedUntil);
      }
      throw new BadRequestException({
        message: 'Girdiğiniz doğrulama kodu hatalıdır.',
        remainingAttempts: MAX_FAILED_ATTEMPTS - failedAttempts,
      });
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const userRole = dto.role || 'guardian';
    const trialEndsAt = new Date();
    if (userRole === 'guardian') {
      trialEndsAt.setDate(trialEndsAt.getDate() + 3);
    }

    const user = await this.prisma.user.create({
      data: {
        email: cleanedEmail,
        passwordHash,
        name: dto.name,
        phone: dto.phone,
        role: userRole,
        trialEndsAt,
        gender: dto.gender,
      },
    });

    // Doğrulama kaydını sil
    await this.prisma.emailVerification
      .delete({
        where: { email: cleanedEmail },
      })
      .catch(() => {});

    const tokens = await this.createSession(user.id, user.email, dto.deviceId);
    const userProfile = await this.usersService.findOne(user.id);

    return {
      message: 'Kayıt işlemi başarıyla tamamlandı.',
      ...tokens,
      user: userProfile,
    };
  }

  async login(dto: LoginDto, requiredRole?: 'admin') {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        memberships: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('E-posta veya şifre hatalı.');
    }

    const isPasswordValid = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );
    if (!isPasswordValid) {
      throw new UnauthorizedException('E-posta veya şifre hatalı.');
    }

    if (requiredRole && user.role !== requiredRole) {
      throw new ForbiddenException('Bu hesap yönetim paneline erişemez.');
    }

    // Cihaz Kilitleme Mantığı (Sadece child ve elder rolleri için)
    if (user.role === 'child' || user.role === 'elder') {
      if (!dto.deviceId) {
        throw new BadRequestException(
          'Bu hesap için cihaz kimliği doğrulaması gereklidir.',
        );
      }

      if (!user.deviceId) {
        // İlk giriş: cihaz kimliğini kaydet
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            deviceId: dto.deviceId,
            loginAllowed: false,
          },
        });
      } else if (user.deviceId !== dto.deviceId) {
        // Farklı cihazdan giriş denemesi
        if (user.loginAllowed) {
          // Velisi izin vermişse yeni cihaza kilitliyoruz
          await this.prisma.user.update({
            where: { id: user.id },
            data: {
              deviceId: dto.deviceId,
              loginAllowed: false,
            },
          });
        } else {
          // Veli izni yok ve cihaz farklı
          throw new UnauthorizedException(
            'Bu hesap başka bir cihaza kilitlenmiştir. Yeni cihazdan giriş yapmak için velinizin onay vermesi gerekmektedir.',
          );
        }
      }
    }

    const tokens = await this.createSession(user.id, user.email, dto.deviceId);
    const userProfile = await this.usersService.findOne(user.id);

    return {
      message: 'Giriş başarılı.',
      ...tokens,
      user: userProfile,
    };
  }

  async adminLogin(dto: LoginDto) {
    return this.login(dto, 'admin');
  }

  private generateAccessToken(
    userId: string,
    email: string,
    sessionId: string,
  ): string {
    return this.jwtService.sign(
      { sub: userId, email, sid: sessionId, typ: 'access' },
      { expiresIn: ACCESS_TOKEN_TTL },
    );
  }

  private async createSession(
    userId: string,
    email: string,
    deviceId?: string,
  ) {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const tokenFamilyId = randomUUID();
    const session = await this.prisma.$transaction(async (tx) => {
      if (deviceId) {
        await tx.session.updateMany({
          where: { userId, deviceId, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }
      return tx.session.create({
        data: {
          userId,
          tokenFamilyId,
          refreshTokenHash,
          deviceId,
          expiresAt: refreshTokenExpiresAt,
        },
      });
    });
    const accessToken = this.generateAccessToken(userId, email, session.id);

    return {
      // Eski frontend sürümleri kırılmasın; yeni frontend accessToken kullanmalı.
      token: accessToken,
      accessToken,
      refreshToken,
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenExpiresAt,
    };
  }

  async refresh(refreshToken: string) {
    const tokenHash = this.hashRefreshToken(refreshToken);
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
      include: { user: { select: { id: true, email: true } } },
    });

    if (!session) {
      throw new UnauthorizedException('Geçersiz refresh token.');
    }

    const now = new Date();
    if (session.revokedAt) {
      await this.handleRefreshTokenReuse(session, now);
    }

    if (session.expiresAt <= now) {
      await this.prisma.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: now },
      });
      throw new UnauthorizedException(
        'Oturumun süresi dolmuş. Lütfen tekrar giriş yapın.',
      );
    }

    const nextRefreshToken = randomBytes(48).toString('base64url');
    const nextTokenHash = this.hashRefreshToken(nextRefreshToken);
    const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    let nextSession: { id: string };
    try {
      nextSession = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.session.updateMany({
          where: { id: session.id, revokedAt: null },
          data: {
            revokedAt: now,
            lastUsedAt: now,
            replacedByTokenHash: nextTokenHash,
          },
        });
        if (claimed.count !== 1) {
          throw new UnauthorizedException('Refresh token tekrar kullanıldı.');
        }
        return tx.session.create({
          data: {
            userId: session.userId,
            tokenFamilyId: session.tokenFamilyId,
            refreshTokenHash: nextTokenHash,
            deviceId: session.deviceId,
            expiresAt: refreshTokenExpiresAt,
          },
          select: { id: true },
        });
      });
    } catch (error) {
      const latestState = await this.prisma.session.findUnique({
        where: { id: session.id },
      });
      if (latestState?.revokedAt) {
        await this.handleRefreshTokenReuse(latestState, new Date());
      }
      throw error;
    }

    const accessToken = this.generateAccessToken(
      session.user.id,
      session.user.email,
      nextSession.id,
    );
    return {
      token: accessToken,
      accessToken,
      refreshToken: nextRefreshToken,
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenExpiresAt,
    };
  }

  async logout(sessionId: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { message: 'Oturum kapatıldı.' };
  }

  async logoutAll(userId: string) {
    await this.revokeAllSessions(userId);
    return { message: 'Tüm cihazlardaki oturumlar kapatıldı.' };
  }

  private async revokeAllSessions(userId: string) {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async handleRefreshTokenReuse(
    session: {
      userId: string;
      tokenFamilyId: string;
      revokedAt: Date | null;
      replacedByTokenHash: string | null;
    },
    now: Date,
  ): Promise<never> {
    if (session.replacedByTokenHash && session.revokedAt) {
      const elapsedMs = now.getTime() - session.revokedAt.getTime();
      if (elapsedMs >= 0 && elapsedMs <= REFRESH_REUSE_GRACE_MS) {
        throw new ConflictException({
          statusCode: HttpStatus.CONFLICT,
          code: 'REFRESH_ALREADY_ROTATED',
          message:
            'Refresh token kısa süre önce yenilendi. Güncel tokenı güvenli depodan tekrar okuyun.',
          retryAfterMs: Math.max(0, REFRESH_REUSE_GRACE_MS - elapsedMs),
        });
      }

      await this.prisma.session.updateMany({
        where: {
          userId: session.userId,
          tokenFamilyId: session.tokenFamilyId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
    }

    throw new UnauthorizedException(
      'Bu refresh token daha önce kullanılmış veya iptal edilmiş.',
    );
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async forgotPassword(email: string) {
    const cleanedEmail = email.toLowerCase().trim();
    const user = await this.prisma.user.findUnique({
      where: { email: cleanedEmail },
    });

    if (!user) {
      return { message: 'E-posta kayıtlıysa şifre sıfırlama kodu gönderildi.' };
    }

    const now = new Date();
    if (user.resetOtpBlockedUntil && user.resetOtpBlockedUntil > now) {
      throw this.tooManyRequests(user.resetOtpBlockedUntil);
    }

    if (user.resetOtpExpiresAt && user.resetOtpExpiresAt > now) {
      return {
        message: 'Mevcut şifre sıfırlama kodunuz hâlâ geçerli.',
        codeSent: false,
        expiresAt: user.resetOtpExpiresAt,
        remainingSeconds: this.remainingSeconds(user.resetOtpExpiresAt),
      };
    }

    const hourlyWindowStart =
      user.resetOtpHourlyWindowStart &&
      now.getTime() - user.resetOtpHourlyWindowStart.getTime() < OTP_HOUR_MS
        ? user.resetOtpHourlyWindowStart
        : now;
    const dailyWindowStart =
      user.resetOtpDailyWindowStart &&
      now.getTime() - user.resetOtpDailyWindowStart.getTime() < OTP_DAY_MS
        ? user.resetOtpDailyWindowStart
        : now;
    const hourlySendCount =
      hourlyWindowStart === user.resetOtpHourlyWindowStart
        ? user.resetOtpHourlySendCount + 1
        : 1;
    const dailySendCount =
      dailyWindowStart === user.resetOtpDailyWindowStart
        ? user.resetOtpDailySendCount + 1
        : 1;

    if (
      hourlySendCount > MAX_HOURLY_SENDS ||
      dailySendCount > MAX_DAILY_SENDS
    ) {
      const blockedUntil = new Date(now.getTime() + OTP_BLOCK_MS);
      await this.prisma.user.update({
        where: { id: user.id },
        data: { resetOtpBlockedUntil: blockedUntil },
      });
      throw this.tooManyRequests(blockedUntil);
    }

    const resetCode = randomInt(100000, 1000000).toString();
    const codeHash = await bcrypt.hash(resetCode, 10);
    const resetExpires = new Date(now.getTime() + OTP_TTL_MS);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetOtpCode: codeHash,
        resetOtpExpiresAt: resetExpires,
        resetOtpFailedAttempts: 0,
        resetOtpBlockedUntil: null,
        resetOtpLastSentAt: now,
        resetOtpHourlyWindowStart: hourlyWindowStart,
        resetOtpHourlySendCount: hourlySendCount,
        resetOtpDailyWindowStart: dailyWindowStart,
        resetOtpDailySendCount: dailySendCount,
      },
    });

    await this.mailService.sendResetPasswordEmail(user.email, resetCode);

    return {
      message: 'Şifre sıfırlama kodu e-posta adresinize gönderildi.',
      codeSent: true,
      expiresAt: resetExpires,
      remainingSeconds: this.remainingSeconds(resetExpires),
    };
  }

  async resetPassword(dto: {
    email: string;
    code: string;
    newPassword: string;
  }) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
    });

    if (!user) {
      throw new BadRequestException(
        'Geçersiz veya süresi dolmuş sıfırlama kodu.',
      );
    }

    const now = new Date();
    if (user.resetOtpBlockedUntil && user.resetOtpBlockedUntil > now) {
      throw this.tooManyRequests(user.resetOtpBlockedUntil);
    }

    if (
      !user.resetOtpCode ||
      !user.resetOtpExpiresAt ||
      user.resetOtpExpiresAt < now
    ) {
      throw new BadRequestException('Sıfırlama kodunun süresi dolmuş.');
    }

    const codeIsValid = await bcrypt.compare(dto.code, user.resetOtpCode);
    if (!codeIsValid) {
      const failedAttempts = user.resetOtpFailedAttempts + 1;
      const blockedUntil =
        failedAttempts >= MAX_FAILED_ATTEMPTS
          ? new Date(now.getTime() + OTP_BLOCK_MS)
          : null;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          resetOtpFailedAttempts: failedAttempts,
          resetOtpBlockedUntil: blockedUntil,
        },
      });
      if (blockedUntil) {
        throw this.tooManyRequests(blockedUntil);
      }
      throw new BadRequestException({
        message: 'Geçersiz sıfırlama kodu.',
        remainingAttempts: MAX_FAILED_ATTEMPTS - failedAttempts,
      });
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          resetOtpCode: null,
          resetOtpExpiresAt: null,
          resetOtpFailedAttempts: 0,
          resetOtpBlockedUntil: null,
        },
      });
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return {
      message:
        'Şifreniz başarıyla sıfırlandı. Yeni şifrenizle giriş yapabilirsiniz.',
    };
  }

  private remainingSeconds(expiresAt: Date): number {
    return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
  }

  private tooManyRequests(blockedUntil: Date): HttpException {
    return new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message:
          'Çok fazla deneme yapıldı. Lütfen engel süresi dolunca tekrar deneyin.',
        blockedUntil,
        remainingSeconds: this.remainingSeconds(blockedUntil),
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
const OTP_TTL_MS = 3 * 60 * 1000;
const OTP_BLOCK_MS = 15 * 60 * 1000;
const OTP_HOUR_MS = 60 * 60 * 1000;
const OTP_DAY_MS = 24 * 60 * 60 * 1000;
const MAX_HOURLY_SENDS = 5;
const MAX_DAILY_SENDS = 15;
const MAX_FAILED_ATTEMPTS = 5;
const ACCESS_TOKEN_TTL = '15m';
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const REFRESH_REUSE_GRACE_MS = 3 * 1000;
