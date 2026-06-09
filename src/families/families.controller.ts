import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { FamiliesService } from './families.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { JoinFamilyDto } from './dto/join-family.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

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
  async join(@GetUser('id') userId: string, @Body() dto: JoinFamilyDto) {
    return this.familiesService.join(userId, dto);
  }

  @Patch(':id/members/role')
  async updateMemberRole(
    @GetUser('id') userId: string,
    @Param('id') familyId: string,
    @Body() body: { targetUserId: string; memberType: string },
  ) {
    return this.familiesService.updateMemberRole(userId, familyId, body.targetUserId, body.memberType);
  }

  @Get(':id')
  async findOne(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.familiesService.findOne(userId, id);
  }

  @Post(':id/invite')
  async invite(@GetUser('id') userId: string, @Param('id') id: string) {
    return this.familiesService.invite(userId, id);
  }
}

