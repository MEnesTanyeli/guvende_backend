import { forwardRef, Module } from '@nestjs/common';
import { LocationsService } from './locations.service';
import { LocationsController } from './locations.controller';
import { LocationsGateway } from './locations.gateway';
import { AuthModule } from '../auth/auth.module';
import { LocationRateLimitService } from './location-rate-limit.service';

@Module({
  imports: [forwardRef(() => AuthModule)],
  providers: [LocationsService, LocationsGateway, LocationRateLimitService],
  controllers: [LocationsController],
  exports: [LocationsService, LocationsGateway, LocationRateLimitService],
})
export class LocationsModule {}
