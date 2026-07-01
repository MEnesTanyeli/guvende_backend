import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { IsOptional, IsString } from 'class-validator';

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

  @Post(':id/reset-device')
  async resetDevice(@GetUser('id') guardianId: string, @Param('id') childId: string) {
    return this.usersService.resetDevice(guardianId, childId);
  }

  @Patch('device-permissions')
  async updateDevicePermissions(@GetUser('id') userId: string, @Body() dto: any) {
    return this.usersService.updateDevicePermissions(userId, dto);
  }
}
