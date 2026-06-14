import { Module } from '@nestjs/common';
import { AppUsageService } from './app-usage.service';
import { AppUsageController } from './app-usage.controller';

@Module({
  providers: [AppUsageService],
  controllers: [AppUsageController],
  exports: [AppUsageService],
})
export class AppUsageModule {}
