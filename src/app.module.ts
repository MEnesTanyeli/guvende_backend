import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { FamiliesModule } from './families/families.module';
import { LocationsModule } from './locations/locations.module';
import { SafeZonesModule } from './safe-zones/safe-zones.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BatteryModule } from './battery/battery.module';
import { AlertsModule } from './alerts/alerts.module';
import { SosModule } from './sos/sos.module';
import { ActivityModule } from './activity/activity.module';
import { CronModule } from './cron/cron.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    AuthModule,
    UsersModule,
    FamiliesModule,
    LocationsModule,
    SafeZonesModule,
    NotificationsModule,
    BatteryModule,
    AlertsModule,
    SosModule,
    ActivityModule,
    CronModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

