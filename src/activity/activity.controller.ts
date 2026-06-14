import { Controller, ForbiddenException, Get, Query, UseGuards } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../auth/guards/subscription.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@UseGuards(JwtAuthGuard, SubscriptionGuard)
@Controller('activity')
export class ActivityController {
  constructor(private activityService: ActivityService) {}

  @Get('daily')
  async getDailyActivity(
    @GetUser('id') userId: string,
    @Query('memberId') memberId?: string,
    @Query('date') date?: string,
  ) {
    const targetUserId = memberId || userId;
    if (memberId && memberId !== userId) {
      const hasAccess = await this.activityService.checkCommonFamily(userId, memberId);
      if (!hasAccess) {
        throw new ForbiddenException('Bu kullanıcının aktivite bilgilerini görmeye yetkiniz yok.');
      }
    }
    return this.activityService.getDailyActivity(targetUserId, date);
  }
}
