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
const record_bulk_locations_dto_1 = require("./dto/record-bulk-locations.dto");
const ack_audible_warning_dto_1 = require("./dto/ack-audible-warning.dto");
const send_audible_warning_dto_1 = require("./dto/send-audible-warning.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const subscription_guard_1 = require("../auth/guards/subscription.guard");
const get_user_decorator_1 = require("../auth/decorators/get-user.decorator");
const location_rate_limit_service_1 = require("./location-rate-limit.service");
const location_rate_limit_filter_1 = require("./location-rate-limit.filter");
let LocationsController = class LocationsController {
    locationsService;
    locationRateLimit;
    constructor(locationsService, locationRateLimit) {
        this.locationsService = locationsService;
        this.locationRateLimit = locationRateLimit;
    }
    async recordLocation(userId, dto) {
        this.locationRateLimit.reserve(userId, 1);
        return this.locationsService.recordLocation(userId, dto);
    }
    async recordBulkLocations(userId, dto) {
        this.locationRateLimit.reserve(userId, dto.locations.length);
        return this.locationsService.recordBulkLocations(userId, dto);
    }
    async getLatestLocations(userId, familyId) {
        return this.locationsService.getLatestLocations(userId, familyId);
    }
    async getLocationsHistory(userId, familyId, targetUserId, dateStr) {
        return this.locationsService.getLocationsHistory(userId, familyId, targetUserId, dateStr);
    }
    async sendAudibleWarning(senderId, dto) {
        return this.locationsService.sendAudibleWarning(senderId, dto.targetUserId, dto.eventId);
    }
    async ackAudibleWarning(userId, dto) {
        return this.locationsService.ackAudibleWarning(userId, dto);
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
    (0, common_1.Post)('locations/bulk'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, record_bulk_locations_dto_1.RecordBulkLocationsDto]),
    __metadata("design:returntype", Promise)
], LocationsController.prototype, "recordBulkLocations", null);
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
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, send_audible_warning_dto_1.SendAudibleWarningDto]),
    __metadata("design:returntype", Promise)
], LocationsController.prototype, "sendAudibleWarning", null);
__decorate([
    (0, common_1.Post)('locations/audible-warning/ack'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ack_audible_warning_dto_1.AckAudibleWarningDto]),
    __metadata("design:returntype", Promise)
], LocationsController.prototype, "ackAudibleWarning", null);
exports.LocationsController = LocationsController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, subscription_guard_1.SubscriptionGuard),
    (0, common_1.UseFilters)(location_rate_limit_filter_1.LocationRateLimitFilter),
    (0, common_1.Controller)(),
    __metadata("design:paramtypes", [locations_service_1.LocationsService,
        location_rate_limit_service_1.LocationRateLimitService])
], LocationsController);
//# sourceMappingURL=locations.controller.js.map