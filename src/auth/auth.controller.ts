import {
  Body,
  Controller,
  Get,
  Post,
  UseGuards,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';
import { Throttle } from '@nestjs/throttler';
import { RefreshTokenDto } from './dto/session.dto';
import type { AuthenticatedUser } from './types/authenticated-user';

class ForgotPasswordDto {
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz.' })
  @IsNotEmpty({ message: 'E-posta alanı boş bırakılamaz.' })
  email: string;
}

class ResetPasswordDto {
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz.' })
  @IsNotEmpty({ message: 'E-posta alanı boş bırakılamaz.' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Sıfırlama kodu boş bırakılamaz.' })
  code: string;

  @IsString()
  @MinLength(6, { message: 'Yeni şifreniz en az 6 karakter olmalıdır.' })
  newPassword: string;
}

class ConfirmChildElderLogoutDto {
  @IsString()
  @Matches(/^\d{6}$/, { message: 'Doğrulama kodu 6 haneli olmalıdır.' })
  code: string;
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @Post('register/send-code')
  async sendRegisterCode(@Body('email') email: string) {
    if (!email) {
      throw new BadRequestException('E-posta alanı boş bırakılamaz.');
    }
    return this.authService.sendVerificationCode(email);
  }

  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('admin/login')
  async adminLogin(@Body() dto: LoginDto) {
    return this.authService.adminLogin(dto);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  async refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@GetUser() user: AuthenticatedUser) {
    if (!user.sessionId) {
      throw new UnauthorizedException('Oturum bilgisi bulunamadı.');
    }
    return this.authService.logout(user.sessionId);
  }

  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post('logout/approval')
  requestChildElderLogoutApproval(@GetUser() user: AuthenticatedUser) {
    if (!user.sessionId) {
      throw new UnauthorizedException('Oturum bilgisi bulunamadı.');
    }
    return this.authService.requestChildElderLogoutApproval(
      user.id,
      user.sessionId,
    );
  }

  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @UseGuards(JwtAuthGuard)
  @Post('logout/confirm')
  confirmChildElderLogout(
    @GetUser() user: AuthenticatedUser,
    @Body() dto: ConfirmChildElderLogoutDto,
  ) {
    if (!user.sessionId) {
      throw new UnauthorizedException('Oturum bilgisi bulunamadı.');
    }
    return this.authService.confirmChildElderLogout(
      user.id,
      user.sessionId,
      dto.code,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  logoutAll(@GetUser() user: AuthenticatedUser) {
    return this.authService.logoutAll(user.id);
  }

  @Throttle({ default: { limit: 10, ttl: 15 * 60_000 } })
  @Post('forgot-password')
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Throttle({ default: { limit: 5, ttl: 15 * 60_000 } })
  @Post('reset-password')
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getMe(@GetUser() user: AuthenticatedUser) {
    return user;
  }
}
