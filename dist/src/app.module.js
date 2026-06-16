"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const schedule_1 = require("@nestjs/schedule");
const throttler_1 = require("@nestjs/throttler");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const prisma_module_1 = require("./prisma/prisma.module");
const auth_module_1 = require("./auth/auth.module");
const users_module_1 = require("./users/users.module");
const families_module_1 = require("./families/families.module");
const locations_module_1 = require("./locations/locations.module");
const safe_zones_module_1 = require("./safe-zones/safe-zones.module");
const notifications_module_1 = require("./notifications/notifications.module");
const battery_module_1 = require("./battery/battery.module");
const alerts_module_1 = require("./alerts/alerts.module");
const sos_module_1 = require("./sos/sos.module");
const activity_module_1 = require("./activity/activity.module");
const cron_module_1 = require("./cron/cron.module");
const medications_module_1 = require("./medications/medications.module");
const app_usage_module_1 = require("./app-usage/app-usage.module");
const admin_module_1 = require("./admin/admin.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({ isGlobal: true }),
            throttler_1.ThrottlerModule.forRoot([
                {
                    ttl: 60_000,
                    limit: 120,
                },
            ]),
            schedule_1.ScheduleModule.forRoot(),
            prisma_module_1.PrismaModule,
            auth_module_1.AuthModule,
            users_module_1.UsersModule,
            families_module_1.FamiliesModule,
            locations_module_1.LocationsModule,
            safe_zones_module_1.SafeZonesModule,
            notifications_module_1.NotificationsModule,
            battery_module_1.BatteryModule,
            alerts_module_1.AlertsModule,
            sos_module_1.SosModule,
            activity_module_1.ActivityModule,
            cron_module_1.CronModule,
            medications_module_1.MedicationsModule,
            app_usage_module_1.AppUsageModule,
            admin_module_1.AdminModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [
            app_service_1.AppService,
            {
                provide: core_1.APP_GUARD,
                useClass: throttler_1.ThrottlerGuard,
            },
        ],
    })
], AppModule);
//# sourceMappingURL=app.module.js.map