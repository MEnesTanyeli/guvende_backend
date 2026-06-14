import { ConflictException, Injectable, UnauthorizedException, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private usersService: UsersService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictException('Bu e-posta adresi zaten kullanımda.');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const userRole = dto.role || 'guardian';
    const trialEndsAt = new Date();
    if (userRole === 'guardian') {
      trialEndsAt.setDate(trialEndsAt.getDate() + 3);
    }

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        name: dto.name,
        phone: dto.phone,
        role: userRole,
        trialEndsAt,
        gender: dto.gender,
      },
    });

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

    console.log(`\n==================================================`);
    console.log(`🔑 ŞİFRE SIFIRLAMA KODU (${email}): ${resetCode}`);
    console.log(`==================================================\n`);

    return {
      message: 'Şifre sıfırlama kodu başarıyla oluşturuldu (Loglara yazdırıldı).',
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
