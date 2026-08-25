import { Controller, Post, Get, Body, Param, UseGuards } from '@nestjs/common';
import { AppUsageService } from './app-usage.service';
import { SaveAppUsageDto } from './dto/save-app-usage.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../auth/guards/subscription.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@UseGuards(JwtAuthGuard, SubscriptionGuard)
@Controller('app-usage')
export class AppUsageController {
  constructor(private appUsageService: AppUsageService) {}

  @Post()
  async saveAppUsage(
    @GetUser('id') userId: string,
    @Body() dto: SaveAppUsageDto,
  ) {
    return this.appUsageService.saveAppUsage(
      userId,
      dto.usages,
      dto.recordedDate,
    );
  }

  @Get('member/:memberId')
  async getMemberAppUsage(
    @GetUser('id') userId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.appUsageService.getMemberAppUsage(userId, memberId);
  }
}
