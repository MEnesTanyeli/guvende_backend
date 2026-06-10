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
const families_service_1 = require("./families.service");
const create_family_dto_1 = require("./dto/create-family.dto");
const join_family_dto_1 = require("./dto/join-family.dto");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const get_user_decorator_1 = require("../auth/decorators/get-user.decorator");
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
    async updateMemberRole(userId, familyId, body) {
        return this.familiesService.updateMemberRole(userId, familyId, body.targetUserId, body.memberType);
    }
    async findOne(userId, id) {
        return this.familiesService.findOne(userId, id);
    }
    async invite(userId, id) {
        return this.familiesService.invite(userId, id);
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
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, join_family_dto_1.JoinFamilyDto]),
    __metadata("design:returntype", Promise)
], FamiliesController.prototype, "join", null);
__decorate([
    (0, common_1.Patch)(':id/members/role'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", Promise)
], FamiliesController.prototype, "updateMemberRole", null);
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
exports.FamiliesController = FamiliesController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('families'),
    __metadata("design:paramtypes", [families_service_1.FamiliesService])
], FamiliesController);
//# sourceMappingURL=families.controller.js.map