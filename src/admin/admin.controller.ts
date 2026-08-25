import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { AdminGuard } from '../auth/guards/admin.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AdminService } from './admin.service';
import {
  AdminQueryDto,
  AlertQueryDto,
  UserQueryDto,
} from './dto/admin-query.dto';
import { UpdateAdminUserDto } from './dto/update-user.dto';

@Controller('admin')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('dashboard')
  dashboard() {
    return this.adminService.dashboard();
  }

  @Get('users')
  users(@Query() query: UserQueryDto) {
    return this.adminService.users(query);
  }

  @Get('users/:id')
  user(@Param('id') id: string) {
    return this.adminService.user(id);
  }

  @Get('users/:userId/locations/history')
  userHistory(
    @GetUser('id') adminId: string,
    @Param('userId') userId: string,
    @Query('date') dateStr?: string,
  ) {
    return this.adminService.userHistory(adminId, userId, dateStr);
  }

  @Patch('users/:id')
  updateUser(
    @GetUser('id') adminId: string,
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
  ) {
    return this.adminService.updateUser(adminId, id, dto);
  }

  @Patch('users/:id/reset-device')
  resetDevice(@GetUser('id') adminId: string, @Param('id') id: string) {
    return this.adminService.resetDevice(adminId, id);
  }

  @Delete('users/:id')
  deleteUser(@GetUser('id') adminId: string, @Param('id') id: string) {
    return this.adminService.deleteUser(adminId, id);
  }

  @Delete('users/:userId/locations/today')
  deleteUserTodayLocations(
    @GetUser('id') adminId: string,
    @Param('userId') userId: string,
  ) {
    return this.adminService.deleteUserTodayLocations(adminId, userId);
  }

  @Delete('locations/today')
  deleteAllTodayLocations(@GetUser('id') adminId: string) {
    return this.adminService.deleteAllTodayLocations(adminId);
  }

  @Get('families')
  families(@Query() query: AdminQueryDto) {
    return this.adminService.families(query);
  }

  @Get('families/:id')
  family(@Param('id') id: string) {
    return this.adminService.family(id);
  }

  @Get('locations/latest')
  latestLocations() {
    return this.adminService.latestLocations();
  }

  @Delete('families/:id')
  deleteFamily(@GetUser('id') adminId: string, @Param('id') id: string) {
    return this.adminService.deleteFamily(adminId, id);
  }

  @Get('alerts')
  alerts(@Query() query: AlertQueryDto) {
    return this.adminService.alerts(query);
  }

  @Patch('alerts/:id/resolve')
  resolveAlert(@GetUser('id') adminId: string, @Param('id') id: string) {
    return this.adminService.resolveAlert(adminId, id);
  }

  @Get('audit-logs')
  auditLogs(@Query() query: AdminQueryDto) {
    return this.adminService.auditLogs(query);
  }

  @Post('notifications/broadcast')
  broadcast(
    @GetUser('id') adminId: string,
    @Body('target') target: 'guardians' | 'members' | 'all',
    @Body('title') title: string,
    @Body('message') message: string,
  ) {
    return this.adminService.broadcastNotification(
      adminId,
      target,
      title,
      message,
    );
  }
}
