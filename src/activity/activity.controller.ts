import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('activity')
export class ActivityController {
  constructor(private activityService: ActivityService) {}

  @Get('daily')
  async getDailyActivity(
    @GetUser('id') userId: string,
    @Query('date') date?: string,
  ) {
    return this.activityService.getDailyActivity(userId, date);
  }
}
