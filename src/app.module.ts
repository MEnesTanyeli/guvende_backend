import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
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
import { MedicationsModule } from './medications/medications.module';
import { AppUsageModule } from './app-usage/app-usage.module';
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([
      {
        ttl: 60_000,
        limit: 120,
      },
    ]),
    ...(process.env.NODE_ENV === 'test' ? [] : [ScheduleModule.forRoot()]),
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
    ...(process.env.NODE_ENV === 'test' ? [] : [CronModule]),
    MedicationsModule,
    AppUsageModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
