import {
  ConflictException,
  Injectable,
  UnauthorizedException,
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  ServiceUnavailableException,
  forwardRef,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes, randomInt, randomUUID } from 'crypto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { LocationsGateway } from '../locations/locations.gateway';

type RefreshSecurityResult =
  | { kind: 'invalid' }
  | { kind: 'expired' }
  | { kind: 'revoked' }
  | { kind: 'grace'; retryAfterMs: number }
  | {
      kind: 'rotated';
      sessionId: string;
      userId: string;
      email: string;
      refreshToken: string;
      refreshTokenExpiresAt: Date;
    };

type LogoutApprovalResult =
  | { kind: 'approved' }
  | { kind: 'expired' | 'invalid-context' }
  | { kind: 'invalid-code'; remainingAttempts: number }
  | { kind: 'blocked'; blockedUntil: Date };

type LogoutApprovalPreparation =
  | { kind: 'existing'; expiresAt: Date }
  | { kind: 'blocked'; blockedUntil: Date }
  | {
      kind: 'send';
      approvalId: string;
      codeHash: string;
      code: string;
      ownerEmail: string;
      memberName: string;
      expiresAt: Date;
    };

type PasswordResetResult =
  | { kind: 'success' }
  | { kind: 'invalid-user' | 'expired' }
  | { kind: 'invalid-code'; remainingAttempts: number }
  | { kind: 'blocked'; blockedUntil: Date };

type RegistrationOtpPreparation =
  | { kind: 'existing'; expiresAt: Date }
  | { kind: 'blocked'; blockedUntil: Date }
  | {
      kind: 'send';
      code: string;
      codeHash: string;
      expiresAt: Date;
    };

type RegistrationResult =
  | { kind: 'registered'; userId: string; email: string }
  | { kind: 'expired' }
  | { kind: 'invalid-code'; remainingAttempts: number }
  | { kind: 'blocked'; blockedUntil: Date };

type PasswordResetPreparation =
  | { kind: 'missing' }
  | { kind: 'existing'; expiresAt: Date }
  | { kind: 'blocked'; blockedUntil: Date }
  | {
      kind: 'send';
      userId: string;
      email: string;
      code: string;
      codeHash: string;
      expiresAt: Date;
    };

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private usersService: UsersService,
    private mailService: MailService,
    @Inject(forwardRef(() => LocationsGateway))
    private locationsGateway: LocationsGateway,
  ) {}

  async sendVerificationCode(email: string) {
    const cleanedEmail = email.toLowerCase().trim();
    const prepared = await this.withRegistrationOtpLock(
      cleanedEmail,
      async (tx): Promise<RegistrationOtpPreparation> => {
        const existingUser = await tx.user.findUnique({
          where: { email: cleanedEmail },
          select: { id: true },
        });
        if (existingUser) {
          throw new ConflictException('Bu e-posta adresi zaten kullanımda.');
        }

        const now = new Date();
        const verification = await tx.emailVerification.findUnique({
          where: { email: cleanedEmail },
        });
        if (verification?.blockedUntil && verification.blockedUntil > now) {
          return {
            kind: 'blocked',
            blockedUntil: verification.blockedUntil,
          };
        }
        if (verification && verification.expiresAt > now) {
          return { kind: 'existing', expiresAt: verification.expiresAt };
        }

        const hourlyWindowActive =
          !!verification &&
          now.getTime() - verification.hourlyWindowStart.getTime() <
            OTP_HOUR_MS;
        const dailyWindowActive =
          !!verification &&
          now.getTime() - verification.dailyWindowStart.getTime() < OTP_DAY_MS;
        const hourlyWindowStart = hourlyWindowActive
          ? verification.hourlyWindowStart
          : now;
        const dailyWindowStart = dailyWindowActive
          ? verification.dailyWindowStart
          : now;
        const hourlySendCount = hourlyWindowActive
          ? verification.hourlySendCount + 1
          : 1;
        const dailySendCount = dailyWindowActive
          ? verification.dailySendCount + 1
          : 1;

        if (
          hourlySendCount > MAX_HOURLY_SENDS ||
          dailySendCount > MAX_DAILY_SENDS
        ) {
          const blockedUntil = new Date(now.getTime() + OTP_BLOCK_MS);
          if (verification) {
            await tx.emailVerification.update({
              where: { email: cleanedEmail },
              data: { blockedUntil },
            });
          }
          return { kind: 'blocked', blockedUntil };
        }

        const code = randomInt(100000, 1000000).toString();
        const codeHash = await bcrypt.hash(code, 10);
        const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
        await tx.emailVerification.upsert({
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
        return { kind: 'send', code, codeHash, expiresAt };
      },
    );

    if (prepared.kind === 'blocked') {
      throw this.tooManyRequests(prepared.blockedUntil);
    }
    if (prepared.kind === 'existing') {
      return {
        success: true,
        codeSent: false,
        message: 'Mevcut doğrulama kodunuz hâlâ geçerli.',
        expiresAt: prepared.expiresAt,
        remainingSeconds: this.remainingSeconds(prepared.expiresAt),
      };
    }

    try {
      await this.mailService.sendVerificationCodeEmail(
        cleanedEmail,
        prepared.code,
      );
    } catch (error) {
      await this.prisma.emailVerification.updateMany({
        where: { email: cleanedEmail, code: prepared.codeHash },
        data: { expiresAt: new Date() },
      });
      throw error;
    }

    return {
      success: true,
      codeSent: true,
      message: 'Doğrulama kodu e-posta adresinize gönderildi.',
      expiresAt: prepared.expiresAt,
      remainingSeconds: this.remainingSeconds(prepared.expiresAt),
    };
  }

  async register(dto: RegisterDto) {
    const cleanedEmail = dto.email.toLowerCase().trim();
    const result = await this.withRegistrationOtpLock(
      cleanedEmail,
      async (tx): Promise<RegistrationResult> => {
        const existingUser = await tx.user.findUnique({
          where: { email: cleanedEmail },
          select: { id: true },
        });
        if (existingUser) {
          throw new ConflictException('Bu e-posta adresi zaten kullanımda.');
        }

        const verification = await tx.emailVerification.findUnique({
          where: { email: cleanedEmail },
        });
        const now = new Date();
        if (verification?.blockedUntil && verification.blockedUntil > now) {
          return {
            kind: 'blocked',
            blockedUntil: verification.blockedUntil,
          };
        }
        if (!verification || verification.expiresAt < now) {
          return { kind: 'expired' };
        }

        const codeIsValid = await bcrypt.compare(dto.code, verification.code);
        if (!codeIsValid) {
          const failedAttempts = verification.failedAttempts + 1;
          const blockedUntil =
            failedAttempts >= MAX_FAILED_ATTEMPTS
              ? new Date(now.getTime() + OTP_BLOCK_MS)
              : null;
          await tx.emailVerification.update({
            where: { email: cleanedEmail },
            data: { failedAttempts, blockedUntil },
          });
          if (blockedUntil) return { kind: 'blocked', blockedUntil };
          return {
            kind: 'invalid-code',
            remainingAttempts: MAX_FAILED_ATTEMPTS - failedAttempts,
          };
        }

        const passwordHash = await bcrypt.hash(dto.password, 10);
        const userRole = dto.role || 'guardian';
        const trialEndsAt = new Date();
        if (userRole === 'guardian') {
          trialEndsAt.setDate(trialEndsAt.getDate() + 3);
        }
        const user = await tx.user.create({
          data: {
            email: cleanedEmail,
            passwordHash,
            name: dto.name,
            phone: dto.phone,
            role: userRole,
            trialEndsAt,
            gender: dto.gender,
          },
          select: { id: true, email: true },
        });
        await tx.emailVerification.delete({
          where: { email: cleanedEmail },
        });
        return { kind: 'registered', userId: user.id, email: user.email };
      },
    );

    if (result.kind === 'blocked') {
      throw this.tooManyRequests(result.blockedUntil);
    }
    if (result.kind === 'expired') {
      throw new BadRequestException(
        'Doğrulama kodunun süresi dolmuş. Lütfen yeni bir kod isteyin.',
      );
    }
    if (result.kind === 'invalid-code') {
      throw new BadRequestException({
        message: 'Girdiğiniz doğrulama kodu hatalıdır.',
        remainingAttempts: result.remainingAttempts,
      });
    }

    const tokens = await this.createSession(
      result.userId,
      result.email,
      dto.deviceId,
    );
    const userProfile = await this.usersService.findOne(result.userId);

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

    let tokens: Awaited<ReturnType<AuthService['createSession']>>;

    // Cihaz Kilitleme Mantığı (Sadece child ve elder rolleri için)
    if (user.role === 'child' || user.role === 'elder') {
      if (!dto.deviceId) {
        throw new BadRequestException(
          'Bu hesap için cihaz kimliği doğrulaması gereklidir.',
        );
      }

      tokens = await this.withUserSessionSecurityLock(user.id, async (tx) => {
        const currentDeviceState = await tx.user.findUnique({
          where: { id: user.id },
          select: {
            deviceId: true,
            deviceLoginBlocked: true,
          },
        });
        if (!currentDeviceState) {
          throw new UnauthorizedException('Kullanıcı bulunamadı.');
        }
        if (currentDeviceState.deviceLoginBlocked) {
          throw new UnauthorizedException(
            'Bu hesap veli onayıyla kapatılmıştır. Yeniden giriş için aile sahibinin cihazı sıfırlaması gerekir.',
          );
        }

        if (!currentDeviceState.deviceId) {
          // İlk veya owner reset'i sonrası giriş: cihaz kimliğini yeniden bağla.
          await tx.user.update({
            where: { id: user.id },
            data: {
              deviceId: dto.deviceId,
              loginAllowed: false,
            },
          });
        } else if (currentDeviceState.deviceId !== dto.deviceId) {
          throw new UnauthorizedException(
            'Bu hesap başka bir cihaza kilitlenmiştir. Yeni cihazdan giriş yapmak için velinizin onay vermesi gerekmektedir.',
          );
        }

        return this.createSessionInTransaction(
          tx,
          user.id,
          user.email,
          dto.deviceId,
        );
      });
    } else {
      tokens = await this.createSession(user.id, user.email, dto.deviceId);
    }

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
    return this.prisma.$transaction((tx) =>
      this.createSessionInTransaction(tx, userId, email, deviceId),
    );
  }

  private async createSessionInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    email: string,
    deviceId?: string,
  ) {
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const refreshTokenExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);
    const tokenFamilyId = randomUUID();
    if (deviceId) {
      await tx.session.updateMany({
        where: { userId, deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    const session = await tx.session.create({
      data: {
        userId,
        tokenFamilyId,
        refreshTokenHash,
        deviceId,
        expiresAt: refreshTokenExpiresAt,
      },
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
    const candidate = await this.prisma.session.findUnique({
      where: { refreshTokenHash: tokenHash },
      select: { id: true, userId: true },
    });

    if (!candidate) {
      throw new UnauthorizedException('Geçersiz refresh token.');
    }

    const result = await this.withUserSessionSecurityLock(
      candidate.userId,
      async (tx): Promise<RefreshSecurityResult> => {
        // The pre-lock lookup only identifies the trusted lock owner. All
        // security-sensitive state is loaded again after acquiring the lock.
        const session = await tx.session.findUnique({
          where: { id: candidate.id },
          include: { user: { select: { id: true, email: true } } },
        });
        if (!session || session.refreshTokenHash !== tokenHash) {
          return { kind: 'invalid' };
        }

        const now = new Date();
        if (session.revokedAt) {
          return this.handleRefreshTokenReuse(tx, session, now);
        }

        if (session.expiresAt <= now) {
          await tx.session.updateMany({
            where: { id: session.id, revokedAt: null },
            data: { revokedAt: now },
          });
          return { kind: 'expired' };
        }

        const nextRefreshToken = randomBytes(48).toString('base64url');
        const nextTokenHash = this.hashRefreshToken(nextRefreshToken);
        const refreshTokenExpiresAt = new Date(
          Date.now() + REFRESH_TOKEN_TTL_MS,
        );
        const claimed = await tx.session.updateMany({
          where: { id: session.id, revokedAt: null },
          data: {
            revokedAt: now,
            lastUsedAt: now,
            replacedByTokenHash: nextTokenHash,
          },
        });
        if (claimed.count !== 1) {
          return { kind: 'revoked' };
        }
        const nextSession = await tx.session.create({
          data: {
            userId: session.userId,
            tokenFamilyId: session.tokenFamilyId,
            refreshTokenHash: nextTokenHash,
            deviceId: session.deviceId,
            expiresAt: refreshTokenExpiresAt,
          },
          select: { id: true },
        });
        return {
          kind: 'rotated',
          sessionId: nextSession.id,
          userId: session.user.id,
          email: session.user.email,
          refreshToken: nextRefreshToken,
          refreshTokenExpiresAt,
        };
      },
    );

    if (result.kind === 'invalid') {
      throw new UnauthorizedException('Geçersiz refresh token.');
    }
    if (result.kind === 'expired') {
      throw new UnauthorizedException(
        'Oturumun süresi dolmuş. Lütfen tekrar giriş yapın.',
      );
    }
    if (result.kind === 'grace') {
      throw new ConflictException({
        statusCode: HttpStatus.CONFLICT,
        code: 'REFRESH_ALREADY_ROTATED',
        message:
          'Refresh token kısa süre önce yenilendi. Güncel tokenı güvenli depodan tekrar okuyun.',
        retryAfterMs: result.retryAfterMs,
      });
    }
    if (result.kind === 'revoked') {
      throw new UnauthorizedException(
        'Bu refresh token daha önce kullanılmış veya iptal edilmiş.',
      );
    }

    const accessToken = this.generateAccessToken(
      result.userId,
      result.email,
      result.sessionId,
    );
    return {
      token: accessToken,
      accessToken,
      refreshToken: result.refreshToken,
      accessTokenExpiresIn: ACCESS_TOKEN_TTL_SECONDS,
      refreshTokenExpiresAt: result.refreshTokenExpiresAt,
    };
  }

  async logout(sessionId: string) {
    const candidate = await this.prisma.session.findUnique({
      where: { id: sessionId },
      select: { userId: true, user: { select: { role: true } } },
    });
    if (candidate?.user.role === 'child' || candidate?.user.role === 'elder') {
      throw new ForbiddenException(
        'Çocuk ve aile büyüğü hesaplarında çıkış için aile sahibi onayı gerekir.',
      );
    }
    if (candidate) {
      const revokedSessionIds = await this.withUserSessionSecurityLock(
        candidate.userId,
        async (tx): Promise<string[]> => {
        const session = await tx.session.findUnique({
          where: { id: sessionId },
          select: {
            userId: true,
            tokenFamilyId: true,
            user: { select: { role: true } },
          },
        });
        if (!session || session.userId !== candidate.userId) return [];
        if (session.user.role === 'child' || session.user.role === 'elder') {
          throw new ForbiddenException(
            'Çocuk ve aile büyüğü hesaplarında çıkış için aile sahibi onayı gerekir.',
          );
        }
        const sessionsToRevoke = await tx.session.findMany({
          where: {
            userId: session.userId,
            tokenFamilyId: session.tokenFamilyId,
            revokedAt: null,
          },
          select: { id: true },
        });
        await tx.session.updateMany({
          where: {
            userId: session.userId,
            tokenFamilyId: session.tokenFamilyId,
            revokedAt: null,
          },
          data: { revokedAt: new Date() },
        });
        return sessionsToRevoke.map((item) => item.id);
        },
      );
      this.locationsGateway.disconnectSessions(
        candidate.userId,
        revokedSessionIds,
      );
    }
    return { message: 'Oturum kapatıldı.' };
  }

  async requestChildElderLogoutApproval(userId: string, sessionId: string) {
    const now = new Date();
    const prepared = await this.withUserSessionSecurityLock(
      userId,
      async (tx): Promise<LogoutApprovalPreparation> => {
        const session = await tx.session.findFirst({
          where: {
            id: sessionId,
            userId,
            revokedAt: null,
            expiresAt: { gt: now },
          },
          select: { tokenFamilyId: true, deviceId: true },
        });
        if (!session) {
          throw new UnauthorizedException('Aktif oturum bulunamadı.');
        }

        const subject = await this.loadCanonicalLogoutSubject(tx, userId);
        const membership = subject.memberships[0];
        const existing = await tx.childElderLogoutApproval.findUnique({
          where: { userId },
        });

        if (existing?.blockedUntil && existing.blockedUntil > now) {
          return { kind: 'blocked', blockedUntil: existing.blockedUntil };
        }

        const contextMatches =
          existing?.familyId === membership.familyId &&
          existing.ownerId === membership.family.ownerId &&
          existing.tokenFamilyId === session.tokenFamilyId &&
          existing.deviceId === session.deviceId;
        if (existing && existing.expiresAt > now && contextMatches) {
          return { kind: 'existing', expiresAt: existing.expiresAt };
        }

        const hourlyWindowActive =
          !!existing &&
          now.getTime() - existing.hourlyWindowStart.getTime() < OTP_HOUR_MS;
        const dailyWindowActive =
          !!existing &&
          now.getTime() - existing.dailyWindowStart.getTime() < OTP_DAY_MS;
        const hourlyWindowStart = hourlyWindowActive
          ? existing.hourlyWindowStart
          : now;
        const dailyWindowStart = dailyWindowActive
          ? existing.dailyWindowStart
          : now;
        const hourlySendCount = hourlyWindowActive
          ? existing.hourlySendCount + 1
          : 1;
        const dailySendCount = dailyWindowActive
          ? existing.dailySendCount + 1
          : 1;

        if (
          hourlySendCount > MAX_HOURLY_SENDS ||
          dailySendCount > MAX_DAILY_SENDS
        ) {
          const blockedUntil = new Date(now.getTime() + OTP_BLOCK_MS);
          if (existing) {
            await tx.childElderLogoutApproval.update({
              where: { userId },
              data: { blockedUntil },
            });
          }
          return { kind: 'blocked', blockedUntil };
        }

        const code = randomInt(100000, 1000000).toString();
        const codeHash = await bcrypt.hash(code, 10);
        const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
        const approval = await tx.childElderLogoutApproval.upsert({
          where: { userId },
          update: {
            familyId: membership.familyId,
            ownerId: membership.family.ownerId,
            tokenFamilyId: session.tokenFamilyId,
            deviceId: session.deviceId,
            codeHash,
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
            userId,
            familyId: membership.familyId,
            ownerId: membership.family.ownerId,
            tokenFamilyId: session.tokenFamilyId,
            deviceId: session.deviceId,
            codeHash,
            expiresAt,
            lastSentAt: now,
            hourlyWindowStart,
            hourlySendCount,
            dailyWindowStart,
            dailySendCount,
          },
          select: { id: true },
        });

        return {
          kind: 'send',
          approvalId: approval.id,
          codeHash,
          code,
          ownerEmail: membership.family.owner.email,
          memberName: subject.name,
          expiresAt,
        };
      },
    );

    if (prepared.kind === 'blocked') {
      throw this.tooManyRequests(prepared.blockedUntil);
    }
    if (prepared.kind === 'existing') {
      return {
        success: true,
        codeSent: false,
        message:
          'Mevcut çıkış doğrulama kodu hâlâ geçerli. Kod aile sahibinin e-posta adresine gönderildi.',
        expiresAt: prepared.expiresAt,
        remainingSeconds: this.remainingSeconds(prepared.expiresAt),
      };
    }

    try {
      await this.mailService.sendChildElderLogoutCodeEmail(
        prepared.ownerEmail,
        prepared.memberName,
        prepared.code,
      );
    } catch {
      await this.prisma.childElderLogoutApproval.updateMany({
        where: {
          id: prepared.approvalId,
          codeHash: prepared.codeHash,
        },
        data: { expiresAt: new Date() },
      });
      throw new ServiceUnavailableException(
        'Doğrulama kodu gönderilemedi. Oturumunuz açık tutuldu; lütfen tekrar deneyin.',
      );
    }

    return {
      success: true,
      codeSent: true,
      message: 'Doğrulama kodu aile sahibinin e-posta adresine gönderildi.',
      expiresAt: prepared.expiresAt,
      remainingSeconds: this.remainingSeconds(prepared.expiresAt),
    };
  }

  async confirmChildElderLogout(
    userId: string,
    sessionId: string,
    code: string,
  ) {
    const result = await this.withUserSessionSecurityLock(
      userId,
      async (tx): Promise<LogoutApprovalResult> => {
        const now = new Date();
        const session = await tx.session.findUnique({
          where: { id: sessionId },
          select: { userId: true, tokenFamilyId: true, deviceId: true },
        });
        if (!session || session.userId !== userId) {
          return { kind: 'invalid-context' };
        }

        const subject = await this.loadCanonicalLogoutSubject(tx, userId);
        const membership = subject.memberships[0];
        const approval = await tx.childElderLogoutApproval.findUnique({
          where: { userId },
        });
        if (!approval) return { kind: 'expired' };

        const contextMatches =
          approval.familyId === membership.familyId &&
          approval.ownerId === membership.family.ownerId &&
          approval.tokenFamilyId === session.tokenFamilyId &&
          approval.deviceId === session.deviceId;
        if (!contextMatches) {
          await tx.childElderLogoutApproval.delete({ where: { userId } });
          return { kind: 'invalid-context' };
        }
        if (approval.blockedUntil && approval.blockedUntil > now) {
          return { kind: 'blocked', blockedUntil: approval.blockedUntil };
        }
        if (approval.expiresAt <= now) {
          await tx.childElderLogoutApproval.delete({ where: { userId } });
          return { kind: 'expired' };
        }

        const codeIsValid = await bcrypt.compare(code, approval.codeHash);
        if (!codeIsValid) {
          const failedAttempts = approval.failedAttempts + 1;
          const blockedUntil =
            failedAttempts >= MAX_FAILED_ATTEMPTS
              ? new Date(now.getTime() + OTP_BLOCK_MS)
              : null;
          await tx.childElderLogoutApproval.update({
            where: { userId },
            data: { failedAttempts, blockedUntil },
          });
          if (blockedUntil) return { kind: 'blocked', blockedUntil };
          return {
            kind: 'invalid-code',
            remainingAttempts: MAX_FAILED_ATTEMPTS - failedAttempts,
          };
        }

        await tx.childElderLogoutApproval.delete({ where: { userId } });
        await tx.user.update({
          where: { id: userId },
          data: { deviceLoginBlocked: true },
        });
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
        return { kind: 'approved' };
      },
    );

    if (result.kind === 'blocked') {
      throw this.tooManyRequests(result.blockedUntil);
    }
    if (result.kind === 'invalid-code') {
      throw new BadRequestException({
        message: 'Geçersiz çıkış doğrulama kodu.',
        remainingAttempts: result.remainingAttempts,
      });
    }
    if (result.kind === 'expired') {
      throw new BadRequestException(
        'Çıkış doğrulama kodunun süresi dolmuş veya kod daha önce kullanılmış.',
      );
    }
    if (result.kind === 'invalid-context') {
      throw new ForbiddenException(
        'Çıkış doğrulama isteği bu kullanıcı, aile veya cihaz oturumuyla eşleşmiyor.',
      );
    }

    this.locationsGateway.disconnectUser(userId);
    return { message: 'Oturum aile sahibi onayıyla kapatıldı.' };
  }

  async logoutAll(userId: string) {
    await this.revokeAllSessions(userId);
    this.locationsGateway.disconnectUser(userId);
    return { message: 'Tüm cihazlardaki oturumlar kapatıldı.' };
  }

  private async revokeAllSessions(userId: string) {
    await this.withUserSessionSecurityLock(userId, async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { role: true },
      });
      if (!user) throw new UnauthorizedException('Kullanıcı bulunamadı.');
      if (user.role === 'child' || user.role === 'elder') {
        throw new ForbiddenException(
          'Çocuk ve aile büyüğü hesaplarında çıkış için aile sahibi onayı gerekir.',
        );
      }
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }

  private async loadCanonicalLogoutSubject(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    const subject = await tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        role: true,
        memberships: {
          where: { memberType: { in: ['child', 'elder'] } },
          take: 2,
          select: {
            familyId: true,
            memberType: true,
            family: {
              select: {
                ownerId: true,
                owner: { select: { email: true } },
              },
            },
          },
        },
      },
    });
    if (!subject || (subject.role !== 'child' && subject.role !== 'elder')) {
      throw new ForbiddenException(
        'Bu onay akışı yalnız çocuk ve aile büyüğü hesapları içindir.',
      );
    }
    if (
      subject.memberships.length !== 1 ||
      subject.memberships[0].memberType !== subject.role
    ) {
      throw new ConflictException(
        'Çıkış onayı için tek ve doğrulanabilir bir aile sahibi belirlenemedi.',
      );
    }
    return subject;
  }

  private async handleRefreshTokenReuse(
    tx: Prisma.TransactionClient,
    session: {
      userId: string;
      tokenFamilyId: string;
      revokedAt: Date | null;
      replacedByTokenHash: string | null;
    },
    now: Date,
  ): Promise<RefreshSecurityResult> {
    if (session.replacedByTokenHash && session.revokedAt) {
      const elapsedMs = now.getTime() - session.revokedAt.getTime();
      if (elapsedMs >= 0 && elapsedMs <= REFRESH_REUSE_GRACE_MS) {
        return {
          kind: 'grace',
          retryAfterMs: Math.max(0, REFRESH_REUSE_GRACE_MS - elapsedMs),
        };
      }

      await tx.session.updateMany({
        where: {
          userId: session.userId,
          tokenFamilyId: session.tokenFamilyId,
          revokedAt: null,
        },
        data: { revokedAt: now },
      });
    }

    return { kind: 'revoked' };
  }

  private async withUserSessionSecurityLock<T>(
    userId: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`session-security:${userId}`}, 0))`;
      return operation(tx);
    });
  }

  private async withRegistrationOtpLock<T>(
    normalizedEmail: string,
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`otp-registration:${normalizedEmail}`}, 0))`;
      return operation(tx);
    });
  }

  private hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  async forgotPassword(email: string) {
    const cleanedEmail = email.toLowerCase().trim();
    const candidate = await this.prisma.user.findUnique({
      where: { email: cleanedEmail },
      select: { id: true },
    });

    if (!candidate) {
      return { message: 'E-posta kayıtlıysa şifre sıfırlama kodu gönderildi.' };
    }

    const prepared = await this.withUserSessionSecurityLock(
      candidate.id,
      async (tx): Promise<PasswordResetPreparation> => {
        const user = await tx.user.findUnique({
          where: { id: candidate.id },
          select: {
            id: true,
            email: true,
            resetOtpBlockedUntil: true,
            resetOtpExpiresAt: true,
            resetOtpHourlyWindowStart: true,
            resetOtpHourlySendCount: true,
            resetOtpDailyWindowStart: true,
            resetOtpDailySendCount: true,
          },
        });
        if (!user) return { kind: 'missing' };

        const now = new Date();
        if (user.resetOtpBlockedUntil && user.resetOtpBlockedUntil > now) {
          return {
            kind: 'blocked',
            blockedUntil: user.resetOtpBlockedUntil,
          };
        }
        if (user.resetOtpExpiresAt && user.resetOtpExpiresAt > now) {
          return { kind: 'existing', expiresAt: user.resetOtpExpiresAt };
        }

        const hourlyWindowActive =
          !!user.resetOtpHourlyWindowStart &&
          now.getTime() - user.resetOtpHourlyWindowStart.getTime() <
            OTP_HOUR_MS;
        const dailyWindowActive =
          !!user.resetOtpDailyWindowStart &&
          now.getTime() - user.resetOtpDailyWindowStart.getTime() < OTP_DAY_MS;
        const hourlyWindowStart = hourlyWindowActive
          ? user.resetOtpHourlyWindowStart!
          : now;
        const dailyWindowStart = dailyWindowActive
          ? user.resetOtpDailyWindowStart!
          : now;
        const hourlySendCount = hourlyWindowActive
          ? user.resetOtpHourlySendCount + 1
          : 1;
        const dailySendCount = dailyWindowActive
          ? user.resetOtpDailySendCount + 1
          : 1;

        if (
          hourlySendCount > MAX_HOURLY_SENDS ||
          dailySendCount > MAX_DAILY_SENDS
        ) {
          const blockedUntil = new Date(now.getTime() + OTP_BLOCK_MS);
          await tx.user.update({
            where: { id: user.id },
            data: { resetOtpBlockedUntil: blockedUntil },
          });
          return { kind: 'blocked', blockedUntil };
        }

        const code = randomInt(100000, 1000000).toString();
        const codeHash = await bcrypt.hash(code, 10);
        const expiresAt = new Date(now.getTime() + OTP_TTL_MS);
        await tx.user.update({
          where: { id: user.id },
          data: {
            resetOtpCode: codeHash,
            resetOtpExpiresAt: expiresAt,
            resetOtpFailedAttempts: 0,
            resetOtpBlockedUntil: null,
            resetOtpLastSentAt: now,
            resetOtpHourlyWindowStart: hourlyWindowStart,
            resetOtpHourlySendCount: hourlySendCount,
            resetOtpDailyWindowStart: dailyWindowStart,
            resetOtpDailySendCount: dailySendCount,
          },
        });
        return {
          kind: 'send',
          userId: user.id,
          email: user.email,
          code,
          codeHash,
          expiresAt,
        };
      },
    );

    if (prepared.kind === 'missing') {
      return { message: 'E-posta kayıtlıysa şifre sıfırlama kodu gönderildi.' };
    }
    if (prepared.kind === 'blocked') {
      throw this.tooManyRequests(prepared.blockedUntil);
    }
    if (prepared.kind === 'existing') {
      return {
        message: 'Mevcut şifre sıfırlama kodunuz hâlâ geçerli.',
        codeSent: false,
        expiresAt: prepared.expiresAt,
        remainingSeconds: this.remainingSeconds(prepared.expiresAt),
      };
    }

    try {
      await this.mailService.sendResetPasswordEmail(
        prepared.email,
        prepared.code,
      );
    } catch (error) {
      await this.prisma.user.updateMany({
        where: { id: prepared.userId, resetOtpCode: prepared.codeHash },
        data: { resetOtpExpiresAt: new Date() },
      });
      throw error;
    }

    return {
      message: 'Şifre sıfırlama kodu e-posta adresinize gönderildi.',
      codeSent: true,
      expiresAt: prepared.expiresAt,
      remainingSeconds: this.remainingSeconds(prepared.expiresAt),
    };
  }

  async resetPassword(dto: {
    email: string;
    code: string;
    newPassword: string;
  }) {
    const candidate = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      select: { id: true },
    });

    if (!candidate) {
      throw new BadRequestException(
        'Geçersiz veya süresi dolmuş sıfırlama kodu.',
      );
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    const result = await this.withUserSessionSecurityLock(
      candidate.id,
      async (tx): Promise<PasswordResetResult> => {
        const user = await tx.user.findUnique({
          where: { id: candidate.id },
          select: {
            id: true,
            resetOtpCode: true,
            resetOtpExpiresAt: true,
            resetOtpFailedAttempts: true,
            resetOtpBlockedUntil: true,
          },
        });
        if (!user) return { kind: 'invalid-user' };

        const now = new Date();
        if (user.resetOtpBlockedUntil && user.resetOtpBlockedUntil > now) {
          return {
            kind: 'blocked',
            blockedUntil: user.resetOtpBlockedUntil,
          };
        }
        if (
          !user.resetOtpCode ||
          !user.resetOtpExpiresAt ||
          user.resetOtpExpiresAt < now
        ) {
          return { kind: 'expired' };
        }

        const codeIsValid = await bcrypt.compare(dto.code, user.resetOtpCode);
        if (!codeIsValid) {
          const failedAttempts = user.resetOtpFailedAttempts + 1;
          const blockedUntil =
            failedAttempts >= MAX_FAILED_ATTEMPTS
              ? new Date(now.getTime() + OTP_BLOCK_MS)
              : null;
          await tx.user.update({
            where: { id: user.id },
            data: {
              resetOtpFailedAttempts: failedAttempts,
              resetOtpBlockedUntil: blockedUntil,
            },
          });
          if (blockedUntil) return { kind: 'blocked', blockedUntil };
          return {
            kind: 'invalid-code',
            remainingAttempts: MAX_FAILED_ATTEMPTS - failedAttempts,
          };
        }

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
        return { kind: 'success' };
      },
    );

    if (result.kind === 'invalid-user') {
      throw new BadRequestException(
        'Geçersiz veya süresi dolmuş sıfırlama kodu.',
      );
    }
    if (result.kind === 'expired') {
      throw new BadRequestException('Sıfırlama kodunun süresi dolmuş.');
    }
    if (result.kind === 'blocked') {
      throw this.tooManyRequests(result.blockedUntil);
    }
    if (result.kind === 'invalid-code') {
      throw new BadRequestException({
        message: 'Geçersiz sıfırlama kodu.',
        remainingAttempts: result.remainingAttempts,
      });
    }

    this.locationsGateway.disconnectUser(candidate.id);
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
