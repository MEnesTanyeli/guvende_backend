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
exports.SafeZonesController = void 0;
const common_1 = require("@nestjs/common");
const safe_zones_service_1 = require("./safe-zones.service");
const create_safe_zone_dto_1 = require("./dto/create-safe-zone.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const subscription_guard_1 = require("../auth/guards/subscription.guard");
const get_user_decorator_1 = require("../auth/decorators/get-user.decorator");
let SafeZonesController = class SafeZonesController {
    safeZonesService;
    constructor(safeZonesService) {
        this.safeZonesService = safeZonesService;
    }
    async create(userId, familyId, dto) {
        return this.safeZonesService.create(userId, familyId, dto);
    }
    async findAll(userId, familyId) {
        return this.safeZonesService.findAll(userId, familyId);
    }
    async remove(userId, id) {
        return this.safeZonesService.remove(userId, id);
    }
};
exports.SafeZonesController = SafeZonesController;
__decorate([
    (0, common_1.Post)('families/:familyId/safe-zones'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('familyId')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, create_safe_zone_dto_1.CreateSafeZoneDto]),
    __metadata("design:returntype", Promise)
], SafeZonesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)('families/:familyId/safe-zones'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('familyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], SafeZonesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Delete)('safe-zones/:id'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], SafeZonesController.prototype, "remove", null);
exports.SafeZonesController = SafeZonesController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, subscription_guard_1.SubscriptionGuard),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [safe_zones_service_1.SafeZonesService])
], SafeZonesController);
//# sourceMappingURL=safe-zones.controller.js.map