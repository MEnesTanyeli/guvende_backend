import { Module } from '@nestjs/common';
import { FamiliesService } from './families.service';
import { FamiliesController } from './families.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { LocationsModule } from '../locations/locations.module';
import { OfflineSosModule } from '../offline-sos/offline-sos.module';
import { JoinUserThrottleGuard } from './guards/join-user-throttle.guard';

@Module({
  imports: [NotificationsModule, LocationsModule, OfflineSosModule],
  providers: [FamiliesService, JoinUserThrottleGuard],
  controllers: [FamiliesController],
  exports: [FamiliesService],
})
export class FamiliesModule {}
