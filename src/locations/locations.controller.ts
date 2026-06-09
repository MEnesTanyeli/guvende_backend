import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { RecordLocationDto } from './dto/record-location.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller()
export class LocationsController {
  constructor(private locationsService: LocationsService) {}

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
}
