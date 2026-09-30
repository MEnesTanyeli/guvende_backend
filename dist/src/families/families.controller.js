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
exports.FamiliesController = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const families_service_1 = require("./families.service");
const create_family_dto_1 = require("./dto/create-family.dto");
const join_family_dto_1 = require("./dto/join-family.dto");
const mute_notifications_dto_1 = require("./dto/mute-notifications.dto");
const update_own_tracking_dto_1 = require("./dto/update-own-tracking.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const get_user_decorator_1 = require("../auth/decorators/get-user.decorator");
const offline_sos_provisioning_dto_1 = require("../offline-sos/dto/offline-sos-provisioning.dto");
const join_user_throttle_guard_1 = require("./guards/join-user-throttle.guard");
let FamiliesController = class FamiliesController {
    familiesService;
    constructor(familiesService) {
        this.familiesService = familiesService;
    }
    async create(userId, dto) {
        return this.familiesService.create(userId, dto);
    }
    async findAll(userId) {
        return this.familiesService.findAll(userId);
    }
    async join(userId, dto) {
        return this.familiesService.join(userId, dto);
    }
    async findOne(userId, id) {
        return this.familiesService.findOne(userId, id);
    }
    async invite(userId, id) {
        return this.familiesService.invite(userId, id);
    }
    async rotateInviteCode(userId, id) {
        return this.familiesService.rotateInviteCode(userId, id);
    }
    offlineSosProvisioning(userId, sessionId, familyId, dto) {
        return this.familiesService.offlineSosProvisioning(userId, sessionId, familyId, dto.deviceWrappingPublicKey);
    }
    async leave(userId, id) {
        return this.familiesService.leave(userId, id);
    }
    async removeMember(userId, id, targetUserId) {
        return this.familiesService.removeMember(userId, id, targetUserId);
    }
    async deleteFamily(userId, id) {
        return this.familiesService.deleteFamily(userId, id);
    }
    async muteNotifications(userId, familyId, dto) {
        return this.familiesService.muteNotifications(userId, familyId, dto.mute);
    }
    async updateOwnTracking(userId, familyId, dto) {
        return this.familiesService.updateOwnTracking(userId, familyId, dto.enabled);
    }
};
exports.FamiliesController = FamiliesController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_family_dto_1.CreateFamilyDto]),
    __metadata("design:returntype", Promise)
], FamiliesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], FamiliesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Post)('join'),
    (0, throttler_1.Throttle)({ default: { limit: 5, ttl: 60_000 } }),
    (0, common_1.UseGuards)(join_user_throttle_guard_1.JoinUserThrottleGuard),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, join_family_dto_1.JoinFamilyDto]),
    __metadata("design:returntype", Promise)
], FamiliesController.prototype, "join", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FamiliesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(':id/invite'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FamiliesController.prototype, "invite", null);
__decorate([
    (0, common_1.Post)(':id/invite-code/rotate'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FamiliesController.prototype, "rotateInviteCode", null);
__decorate([
    (0, common_1.Post)(':id/offline-sos/provisioning'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, get_user_decorator_1.GetUser)('sessionId')),
    __param(2, (0, common_1.Param)('id')),
    __param(3, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, offline_sos_provisioning_dto_1.OfflineSosProvisioningDto]),
    __metadata("design:returntype", void 0)
], FamiliesController.prototype, "offlineSosProvisioning", null);
__decorate([
    (0, common_1.Delete)(':id/leave'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FamiliesController.prototype, "leave", null);
__decorate([
    (0, common_1.Delete)(':id/members/:targetUserId'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Param)('targetUserId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], FamiliesController.prototype, "removeMember", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], FamiliesController.prototype, "deleteFamily", null);
__decorate([
    (0, common_1.Patch)(':id/mute'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, mute_notifications_dto_1.MuteNotificationsDto]),
    __metadata("design:returntype", Promise)
], FamiliesController.prototype, "muteNotifications", null);
__decorate([
    (0, common_1.Patch)(':id/tracking'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_own_tracking_dto_1.UpdateOwnTrackingDto]),
    __metadata("design:returntype", Promise)
], FamiliesController.prototype, "updateOwnTracking", null);
exports.FamiliesController = FamiliesController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('families'),
    __metadata("design:paramtypes", [families_service_1.FamiliesService])
], FamiliesController);
//# sourceMappingURL=families.controller.js.map