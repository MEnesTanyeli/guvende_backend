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
exports.LocationsController = void 0;
const common_1 = require("@nestjs/common");
const locations_service_1 = require("./locations.service");
const record_location_dto_1 = require("./dto/record-location.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const subscription_guard_1 = require("../auth/guards/subscription.guard");
const get_user_decorator_1 = require("../auth/decorators/get-user.decorator");
let LocationsController = class LocationsController {
    locationsService;
    constructor(locationsService) {
        this.locationsService = locationsService;
    }
    async recordLocation(userId, dto) {
        return this.locationsService.recordLocation(userId, dto);
    }
    async getLatestLocations(userId, familyId) {
        return this.locationsService.getLatestLocations(userId, familyId);
    }
    async getLocationsHistory(userId, familyId, targetUserId, dateStr) {
        return this.locationsService.getLocationsHistory(userId, familyId, targetUserId, dateStr);
    }
    async sendAudibleWarning(senderId, targetUserId) {
        return this.locationsService.sendAudibleWarning(senderId, targetUserId);
    }
    async ackAudibleWarning(childId, senderId, action) {
        return this.locationsService.ackAudibleWarning(childId, senderId, action);
    }
};
exports.LocationsController = LocationsController;
__decorate([
    (0, common_1.Post)('locations'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, record_location_dto_1.RecordLocationDto]),
    __metadata("design:returntype", Promise)
], LocationsController.prototype, "recordLocation", null);
__decorate([
    (0, common_1.Get)('families/:familyId/locations/latest'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('familyId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], LocationsController.prototype, "getLatestLocations", null);
__decorate([
    (0, common_1.Get)('families/:familyId/locations/history/:targetUserId'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('familyId')),
    __param(2, (0, common_1.Param)('targetUserId')),
    __param(3, (0, common_1.Query)('date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], LocationsController.prototype, "getLocationsHistory", null);
__decorate([
    (0, common_1.Post)('locations/audible-warning'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)('targetUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], LocationsController.prototype, "sendAudibleWarning", null);
__decorate([
    (0, common_1.Post)('locations/audible-warning/ack'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)('senderId')),
    __param(2, (0, common_1.Body)('action')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], LocationsController.prototype, "ackAudibleWarning", null);
exports.LocationsController = LocationsController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, subscription_guard_1.SubscriptionGuard),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [locations_service_1.LocationsService])
], LocationsController);
//# sourceMappingURL=locations.controller.js.map