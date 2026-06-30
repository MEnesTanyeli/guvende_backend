import { Body, Controller, Delete, Get, Param, Post, UseGuards, Query } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { RecordLocationDto } from './dto/record-location.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../auth/guards/subscription.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { LocationsGateway } from './locations.gateway';

@UseGuards(JwtAuthGuard, SubscriptionGuard)
@Controller()
export class LocationsController {
  constructor(
    private locationsService: LocationsService,
    private locationsGateway: LocationsGateway
  ) {}

  @Post('locations')
  async recordLocation(@GetUser('id') userId: string, @Body() dto: RecordLocationDto) {
    return this.locationsService.recordLocation(userId, dto);
  }

  @Get('families/:familyId/locations/latest')
  async getLatestLocations(
    @GetUser('id') userId: string,
    @Param('familyId') familyId: string,
  ) {
    return this.locationsService.getLatestLocations(userId, familyId);
  }

  @Get('families/:familyId/locations/history/:targetUserId')
  async getLocationsHistory(
    @GetUser('id') userId: string,
    @Param('familyId') familyId: string,
    @Param('targetUserId') targetUserId: string,
    @Query('date') dateStr?: string,
  ) {
    return this.locationsService.getLocationsHistory(userId, familyId, targetUserId, dateStr);
  }

  @Post('locations/audible-warning')
  async sendAudibleWarning(
    @GetUser('id') senderId: string,
    @Body('targetUserId') targetUserId: string,
  ) {
    return this.locationsService.sendAudibleWarning(senderId, targetUserId);
  }

  @Post('locations/audible-warning/ack')
  async ackAudibleWarning(
    @GetUser('id') childId: string,
    @Body('senderId') senderId: string,
    @Body('action') action: 'received' | 'muted' | 'unanswered',
  ) {
    return this.locationsService.ackAudibleWarning(childId, senderId, action);
  }

  @Delete('families/:familyId/members/:targetUserId/locations/today')
  async deleteTodayLocations(
    @GetUser('id') userId: string,
    @Param('familyId') familyId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.locationsService.deleteTodayLocations(userId, familyId, targetUserId);
  }

  @Post('families/:familyId/members/:targetUserId/test-drift')
  async triggerTestDrift(
    @GetUser('id') userId: string,
    @Param('familyId') familyId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    const res = await this.locationsService.triggerTestLocationEvent(userId, familyId, targetUserId);
    this.locationsGateway.server.to(`family_${familyId}`).emit('trigger-test-drift', { targetUserId });
    return res;
  }

  @Post('families/:familyId/members/:targetUserId/test-walk')
  async triggerTestWalk(
    @GetUser('id') userId: string,
    @Param('familyId') familyId: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    const res = await this.locationsService.triggerTestLocationEvent(userId, familyId, targetUserId);
    this.locationsGateway.server.to(`family_${familyId}`).emit('trigger-test-walk', { targetUserId });
    return res;
  }
}
