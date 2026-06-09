import { Module } from '@nestjs/common';
import { SafeZonesService } from './safe-zones.service';
import { SafeZonesController } from './safe-zones.controller';

@Module({
  providers: [SafeZonesService],
  controllers: [SafeZonesController],
  exports: [SafeZonesService],
})
export class SafeZonesModule {}
