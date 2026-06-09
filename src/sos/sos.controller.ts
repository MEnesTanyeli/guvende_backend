import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { SosService } from './sos.service';
import { TriggerSosDto } from './dto/trigger-sos.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GetUser } from '../auth/decorators/get-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('sos')
export class SosController {
  constructor(private sosService: SosService) {}

  @Post()
  async triggerSos(@GetUser('id') userId: string, @Body() dto: TriggerSosDto) {
    return this.sosService.triggerSos(userId, dto);
  }
}
