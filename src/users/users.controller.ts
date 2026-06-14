import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { IsOptional, IsString, IsEmail, IsNotEmpty } from 'class-validator';

class RequestEmailChangeDto {
  @IsEmail({}, { message: 'Geçerli bir yeni e-posta adresi giriniz.' })
  @IsNotEmpty({ message: 'Yeni e-posta alanı boş bırakılamaz.' })
  newEmail: string;
}

class ConfirmEmailChangeDto {
  @IsString()
  @IsNotEmpty({ message: 'Doğrulama kodu boş bırakılamaz.' })
  code: string;
}

class UpdateProfileDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  gender?: string;
}

@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('profile')
  async getProfile(@GetUser('id') userId: string) {
    return this.usersService.findOne(userId);
  }

  @Patch('profile')
  async updateProfile(@GetUser('id') userId: string, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(userId, dto.name, dto.phone, dto.gender);
  }

  @Post('purchase-mock')
  async purchasePremiumMock(@GetUser('id') userId: string) {
    return this.usersService.purchasePremiumMock(userId);
  }

  @Post('proxy')
  async setProxy(@GetUser('id') userId: string, @Body() body: { email: string }) {
    return this.usersService.setProxy(userId, body.email);
  }

  @Patch('proxy/remove') // Or @Delete('proxy') but since Ionic HttpClient/Angular uses Delete sometimes with no body, let's also support DELETE proxy
  async removeProxyPatch(@GetUser('id') userId: string) {
    return this.usersService.removeProxy(userId);
  }

  @Post('proxy/remove') // Support both just in case
  async removeProxyPost(@GetUser('id') userId: string) {
    return this.usersService.removeProxy(userId);
  }

  @Post('request-email-change')
  async requestEmailChange(@GetUser('id') userId: string, @Body() dto: RequestEmailChangeDto) {
    return this.usersService.requestEmailChange(userId, dto.newEmail);
  }

  @Post('confirm-email-change')
  async confirmEmailChange(@GetUser('id') userId: string, @Body() dto: ConfirmEmailChangeDto) {
    return this.usersService.confirmEmailChange(userId, dto.code);
  }
}
