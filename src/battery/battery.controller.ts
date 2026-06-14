import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { BatteryService } from './battery.service';
import { UpdateBatteryDto } from './dto/update-battery.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../auth/guards/subscription.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@UseGuards(JwtAuthGuard, SubscriptionGuard)
@Controller('battery')
export class BatteryController {
  constructor(private batteryService: BatteryService) {}

  @Post()
  async updateBattery(@GetUser('id') userId: string, @Body() dto: UpdateBatteryDto) {
    return this.batteryService.updateBattery(userId, dto);
  }
}
