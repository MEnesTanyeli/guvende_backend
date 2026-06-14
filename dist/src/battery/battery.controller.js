"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.BatteryController = void 0;
const common_1 = require("@nestjs/common");
const battery_service_1 = require("./battery.service");
const update_battery_dto_1 = require("./dto/update-battery.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const subscription_guard_1 = require("../auth/guards/subscription.guard");
const get_user_decorator_1 = require("../auth/decorators/get-user.decorator");
let BatteryController = class BatteryController {
    batteryService;
    constructor(batteryService) {
        this.batteryService = batteryService;
    }
    async updateBattery(userId, dto) {
        return this.batteryService.updateBattery(userId, dto);
    }
};
exports.BatteryController = BatteryController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, update_battery_dto_1.UpdateBatteryDto]),
    __metadata("design:returntype", Promise)
], BatteryController.prototype, "updateBattery", null);
exports.BatteryController = BatteryController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, subscription_guard_1.SubscriptionGuard),
    (0, common_1.Controller)('battery'),
    __metadata("design:paramtypes", [battery_service_1.BatteryService])
], BatteryController);
//# sourceMappingURL=battery.controller.js.map