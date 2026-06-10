import { Global, Module } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { LocationsModule } from '../locations/locations.module';

@Global()
@Module({
  imports: [LocationsModule],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
