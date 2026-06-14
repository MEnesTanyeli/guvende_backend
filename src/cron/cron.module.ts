import { Module } from '@nestjs/common';
import { CronService } from './cron.service';
import { LocationsModule } from '../locations/locations.module';

@Module({
  imports: [LocationsModule],
  providers: [CronService],
  exports: [CronService],
})
export class CronModule {}
