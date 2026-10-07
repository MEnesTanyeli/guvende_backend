import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
  Query,
  UseFilters,
} from '@nestjs/common';
import { LocationsService } from './locations.service';
import { RecordLocationDto } from './dto/record-location.dto';
import { RecordBulkLocationsDto } from './dto/record-bulk-locations.dto';
import { AckAudibleWarningDto } from './dto/ack-audible-warning.dto';
import { SendAudibleWarningDto } from './dto/send-audible-warning.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../auth/guards/subscription.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { LocationRateLimitFilter } from './location-rate-limit.filter';

@UseGuards(JwtAuthGuard, SubscriptionGuard)
@UseFilters(LocationRateLimitFilter)
@Controller()
export class LocationsController {
  constructor(private locationsService: LocationsService) {}

  @Post('locations')
  async recordLocation(
    @GetUser('id') userId: string,
    @Body() dto: RecordLocationDto,
  ) {
    return this.locationsService.recordLocation(userId, dto);
  }

  @Post('locations/bulk')
  async recordBulkLocations(
    @GetUser('id') userId: string,
    @Body() dto: RecordBulkLocationsDto,
  ) {
    return this.locationsService.recordBulkLocations(userId, dto);
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
    return this.locationsService.getLocationsHistory(
      userId,
      familyId,
      targetUserId,
      dateStr,
    );
  }

  @Post('locations/audible-warning')
  async sendAudibleWarning(
    @GetUser('id') senderId: string,
    @Body() dto: SendAudibleWarningDto,
  ) {
    return this.locationsService.sendAudibleWarning(
      senderId,
      dto.targetUserId,
      dto.eventId,
    );
  }

  @Post('locations/audible-warning/ack')
  async ackAudibleWarning(
    @GetUser('id') userId: string,
    @Body() dto: AckAudibleWarningDto,
  ) {
    return this.locationsService.ackAudibleWarning(userId, dto);
  }
}
