import { Module } from '@nestjs/common';
import { FamiliesService } from './families.service';
import { FamiliesController } from './families.controller';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [NotificationsModule],
  providers: [FamiliesService],
  controllers: [FamiliesController],
  exports: [FamiliesService],
})
export class FamiliesModule {}
