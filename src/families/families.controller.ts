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
import { Throttle } from '@nestjs/throttler';
import { FamiliesService } from './families.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { JoinFamilyDto } from './dto/join-family.dto';
import { MuteNotificationsDto } from './dto/mute-notifications.dto';
import { UpdateOwnTrackingDto } from './dto/update-own-tracking.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';
import { OfflineSosProvisioningDto } from '../offline-sos/dto/offline-sos-provisioning.dto';
import { JoinUserThrottleGuard } from './guards/join-user-throttle.guard';

@UseGuards(JwtAuthGuard)
@Controller('families')
export class FamiliesController {
  constructor(private familiesService: FamiliesService) {}

  @Post()
  async create(@GetUser('id') userId: string, @Body() dto: CreateFamilyDto) {
    return this.familiesService.create(userId, dto);
  }

  @Get()
  async findAll(@GetUser('id') userId: string) {
    return this.familiesService.findAll(userId);
  }

  @Post('join')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UseGuards(JoinUserThrottleGuard)
  async join(@GetUser('id') userId: string, @Body() dto: JoinFamilyDto) {
    return this.familiesService.join(userId, dto);
  }

  @Get(':id')
  async findOne(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.familiesService.findOne(userId, id);
  }

  @Post(':id/invite')
  async invite(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.familiesService.invite(userId, id);
  }

  @Post(':id/invite-code/rotate')
  async rotateInviteCode(
    @GetUser('id') userId: string,
    @Param('id') id: string,
  ) {
    return this.familiesService.rotateInviteCode(userId, id);
  }

  @Post(':id/offline-sos/provisioning')
  offlineSosProvisioning(
    @GetUser('id') userId: string,
    @GetUser('sessionId') sessionId: string,
    @Param('id') familyId: string,
    @Body() dto: OfflineSosProvisioningDto,
  ) {
    return this.familiesService.offlineSosProvisioning(
      userId,
      sessionId,
      familyId,
      dto.deviceWrappingPublicKey,
    );
  }

  @Delete(':id/leave')
  async leave(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.familiesService.leave(userId, id);
  }

  @Delete(':id/members/:targetUserId')
  async removeMember(
    @GetUser('id') userId: string,
    @Param('id') id: string,
    @Param('targetUserId') targetUserId: string,
  ) {
    return this.familiesService.removeMember(userId, id, targetUserId);
  }

  @Delete(':id')
  async deleteFamily(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.familiesService.deleteFamily(userId, id);
  }

  @Patch(':id/mute')
  async muteNotifications(
    @GetUser('id') userId: string,
    @Param('id') familyId: string,
    @Body() dto: MuteNotificationsDto,
  ) {
    return this.familiesService.muteNotifications(userId, familyId, dto.mute);
  }

  @Patch(':id/tracking')
  async updateOwnTracking(
    @GetUser('id') userId: string,
    @Param('id') familyId: string,
    @Body() dto: UpdateOwnTrackingDto,
  ) {
    return this.familiesService.updateOwnTracking(
      userId,
      familyId,
      dto.enabled,
    );
  }
}
