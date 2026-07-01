import { ConflictException, Injectable, UnauthorizedException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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

    // E-posta kullanımda mı kontrolü
    const existingUser = await this.prisma.user.findUnique({
      where: { email: cleanedEmail },
    });

    if (existingUser) {
      throw new ConflictException('Bu e-posta adresi zaten kullanımda.');
    }

    // 6 haneli rastgele kod üret
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 dakika geçerli

    // Kod tablosuna kaydet veya güncelle (UPSERT)
    await this.prisma.emailVerification.upsert({
      where: { email: cleanedEmail },
      update: { code, expiresAt },
      create: { email: cleanedEmail, code, expiresAt },
    });

    // E-postayı gönder
    await this.mailService.sendVerificationCodeEmail(cleanedEmail, code);

    return { success: true, message: 'Doğrulama kodu e-posta adresinize gönderildi.' };
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

    if (!verification || verification.code !== dto.code) {
      throw new BadRequestException('Girdiğiniz doğrulama kodu hatalıdır.');
    }

    if (verification.expiresAt < new Date()) {
      throw new BadRequestException('Doğrulama kodunun süresi dolmuş. Lütfen yeni bir kod isteyin.');
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
    await this.prisma.emailVerification.delete({
      where: { email: cleanedEmail },
    }).catch(() => {});

    try {
      await this.mailService.sendWelcomeEmail(user.email, user.name);
    } catch (error) {
      console.error('Hos geldiniz e-postasi gonderilemedi:', error);
    }

    const token = this.generateToken(user.id, user.email);
    const userProfile = await this.usersService.findOne(user.id);

    return {
      message: 'Kayıt işlemi başarıyla tamamlandı.',
      token,
      user: userProfile,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
      include: {
        memberships: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('E-posta veya şifre hatalı.');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedException('E-posta veya şifre hatalı.');
    }

    // Cihaz Kilitleme Mantığı (Sadece child ve elder rolleri için)
    if (user.role === 'child' || user.role === 'elder') {
      if (!dto.deviceId) {
        throw new BadRequestException('Bu hesap için cihaz kimliği doğrulaması gereklidir.');
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
          throw new UnauthorizedException('Bu hesap başka bir cihaza kilitlenmiştir. Yeni cihazdan giriş yapmak için velinizin onay vermesi gerekmektedir.');
        }
      }
    }

    const token = this.generateToken(user.id, user.email);
    const userProfile = await this.usersService.findOne(user.id);

    return {
      message: 'Giriş başarılı.',
      token,
      user: userProfile,
    };
  }

  async adminLogin(dto: LoginDto) {
    const result = await this.login(dto);

    if (result.user.role !== 'admin') {
      throw new ForbiddenException('Bu hesap yönetim paneline erişemez.');
    }

    return result;
  }

  private generateToken(userId: string, email: string): string {
    const payload = { sub: userId, email };
    return this.jwtService.sign(payload);
  }

  async forgotPassword(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      throw new NotFoundException('Bu e-posta adresine kayıtlı kullanıcı bulunamadı.');
    }

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const resetExpires = new Date();
    resetExpires.setMinutes(resetExpires.getMinutes() + 10); // 10 dakika geçerli

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetOtpCode: resetCode,
        resetOtpExpiresAt: resetExpires,
      },
    });

    try {
      await this.mailService.sendResetPasswordEmail(user.email, resetCode);
    } catch (error) {
      console.error('Sifre sifirlama e-postasi gonderilemedi:', error);
      throw new BadRequestException('Şifre sıfırlama e-postası gönderilirken hata oluştu.');
    }

    return {
      message: 'Şifre sıfırlama kodu e-posta adresinize gönderildi.',
    };
  }

  async resetPassword(dto: any) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    if (!user.resetOtpCode || user.resetOtpCode !== dto.code) {
      throw new BadRequestException('Geçersiz sıfırlama kodu.');
    }

    if (!user.resetOtpExpiresAt || user.resetOtpExpiresAt < new Date()) {
      throw new BadRequestException('Sıfırlama kodunun süresi dolmuş.');
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 10);

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetOtpCode: null,
        resetOtpExpiresAt: null,
      },
    });

    return {
      message: 'Şifreniz başarıyla sıfırlandı. Yeni şifrenizle giriş yapabilirsiniz.',
    };
  }
}
