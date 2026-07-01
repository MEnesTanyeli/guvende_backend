import { Body, Controller, Get, Post, UseGuards, BadRequestException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { GetUser } from './decorators/get-user.decorator';
import { IsEmail, IsNotEmpty, IsString, MinLength } from 'class-validator';
import { Throttle } from '@nestjs/throttler';

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
  async getMe(@GetUser() user: any) {
    return user;
  }
}
