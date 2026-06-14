import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../auth/guards/subscription.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@UseGuards(JwtAuthGuard, SubscriptionGuard)
@Controller()
export class AlertsController {
  constructor(private alertsService: AlertsService) {}

  @Get('families/:familyId/alerts')
  async findAll(@GetUser('id') userId: string, @Param('familyId') familyId: string) {
    return this.alertsService.findAll(userId, familyId);
  }

  @Post('alerts/:id/resolve')
  async resolve(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.alertsService.resolve(userId, id);
  }

  @Post('families/:familyId/alerts/resolve-all')
  async resolveAll(@GetUser('id') userId: string, @Param('familyId') familyId: string) {
    return this.alertsService.resolveAll(userId, familyId);
  }
}
