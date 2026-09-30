import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MedicationsService } from './medications.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { SubscriptionGuard } from '../auth/guards/subscription.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';

@UseGuards(JwtAuthGuard, SubscriptionGuard)
@Controller('medications')
export class MedicationsController {
  constructor(private medicationsService: MedicationsService) {}

  @Post()
  async createReminder(
    @GetUser('id') creatorId: string,
    @Body() dto: CreateMedicationDto,
  ) {
    return this.medicationsService.createReminder(creatorId, dto);
  }

  @Get('user/:userId')
  async getReminders(
    @GetUser('id') requesterId: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.medicationsService.getReminders(requesterId, targetUserId);
  }

  @Delete(':id')
  async deleteReminder(
    @GetUser('id') deleterId: string,
    @Param('id') reminderId: string,
  ) {
    return this.medicationsService.deleteReminder(reminderId, deleterId);
  }

  @Post(':id/take')
  async takeMedication(
    @GetUser('id') userId: string,
    @Param('id') reminderId: string,
  ) {
    return this.medicationsService.takeMedication(reminderId, userId);
  }

  @Patch(':id')
  async updateReminder(
    @GetUser('id') updaterId: string,
    @Param('id') reminderId: string,
    @Body() dto: UpdateMedicationDto,
  ) {
    return this.medicationsService.updateReminder(reminderId, updaterId, dto);
  }
}
