import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../auth/guards/subscription.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { GetDailyActivityQueryDto } from './dto/get-daily-activity-query.dto';

@UseGuards(JwtAuthGuard, SubscriptionGuard)
@Controller('activity')
export class ActivityController {
  constructor(private activityService: ActivityService) {}

  @Get('daily')
  async getDailyActivity(
    @GetUser('id') userId: string,
    @Query() query: GetDailyActivityQueryDto,
  ) {
    const targetUserId = query.memberId || userId;
    return this.activityService.getDailyActivity(
      userId,
      targetUserId,
      query.date,
    );
  }
}
