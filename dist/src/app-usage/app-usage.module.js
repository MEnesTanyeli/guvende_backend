"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppUsageModule = void 0;
const common_1 = require("@nestjs/common");
const app_usage_service_1 = require("./app-usage.service");
const app_usage_controller_1 = require("./app-usage.controller");
let AppUsageModule = class AppUsageModule {
};
exports.AppUsageModule = AppUsageModule;
exports.AppUsageModule = AppUsageModule = __decorate([
    (0, common_1.Module)({
        providers: [app_usage_service_1.AppUsageService],
        controllers: [app_usage_controller_1.AppUsageController],
        exports: [app_usage_service_1.AppUsageService],
    })
], AppUsageModule);
//# sourceMappingURL=app-usage.module.js.map