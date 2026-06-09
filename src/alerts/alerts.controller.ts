import { Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AlertsService } from './alerts.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@UseGuards(JwtAuthGuard)
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
}
