import { Module } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';
import { LocationsGateway } from './locations.gateway';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [LocationsService, LocationsGateway],
  controllers: [LocationsController],
  exports: [LocationsService, LocationsGateway],
})
export class LocationsModule {}
