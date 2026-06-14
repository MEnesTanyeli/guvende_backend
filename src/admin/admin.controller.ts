import { Body, Controller, Delete, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminService } from './admin.service';
import { AdminQueryDto, AlertQueryDto, UserQueryDto } from './dto/admin-query.dto';
import { UpdateAdminUserDto } from './dto/update-user.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  dashboard() { return this.adminService.dashboard(); }

  @Get('users')
  users(@Query() query: UserQueryDto) { return this.adminService.users(query); }

  @Patch('users/:id')
  updateUser(@GetUser('id') adminId: string, @Param('id') id: string, @Body() dto: UpdateAdminUserDto) {
    return this.adminService.updateUser(adminId, id, dto);
  }

  @Delete('users/:id')
  deleteUser(@GetUser('id') adminId: string, @Param('id') id: string) {
    return this.adminService.deleteUser(adminId, id);
  }

  @Get('families')
  families(@Query() query: AdminQueryDto) { return this.adminService.families(query); }

  @Get('families/:id')
  family(@Param('id') id: string) { return this.adminService.family(id); }

  @Delete('families/:id')
  deleteFamily(@Param('id') id: string) { return this.adminService.deleteFamily(id); }

  @Get('alerts')
  alerts(@Query() query: AlertQueryDto) { return this.adminService.alerts(query); }

  @Patch('alerts/:id/resolve')
  resolveAlert(@Param('id') id: string) { return this.adminService.resolveAlert(id); }
}
