import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { SafeZonesService } from './safe-zones.service';
import { CreateSafeZoneDto } from './dto/create-safe-zone.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller()
export class SafeZonesController {
  constructor(private safeZonesService: SafeZonesService) {}

  @Post('families/:familyId/safe-zones')
  async create(
    @GetUser('id') userId: string,
    @Param('familyId') familyId: string,
    @Body() dto: CreateSafeZoneDto,
  ) {
    return this.safeZonesService.create(userId, familyId, dto);
  }

  @Get('families/:familyId/safe-zones')
  async findAll(@GetUser('id') userId: string, @Param('familyId') familyId: string) {
    return this.safeZonesService.findAll(userId, familyId);
  }

  @Delete('safe-zones/:id')
  async remove(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.safeZonesService.remove(userId, id);
  }
}
