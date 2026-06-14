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
exports.UsersController = void 0;
const common_1 = require("@nestjs/common");
const users_service_1 = require("./users.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const get_user_decorator_1 = require("../auth/decorators/get-user.decorator");
const class_validator_1 = require("class-validator");
class RequestEmailChangeDto {
    newEmail;
}
__decorate([
    (0, class_validator_1.IsEmail)({}, { message: 'Geçerli bir yeni e-posta adresi giriniz.' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Yeni e-posta alanı boş bırakılamaz.' }),
    __metadata("design:type", String)
], RequestEmailChangeDto.prototype, "newEmail", void 0);
class ConfirmEmailChangeDto {
    code;
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsNotEmpty)({ message: 'Doğrulama kodu boş bırakılamaz.' }),
    __metadata("design:type", String)
], ConfirmEmailChangeDto.prototype, "code", void 0);
class UpdateProfileDto {
    name;
    phone;
    gender;
}
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateProfileDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateProfileDto.prototype, "phone", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], UpdateProfileDto.prototype, "gender", void 0);
let UsersController = class UsersController {
    usersService;
    constructor(usersService) {
        this.usersService = usersService;
    }
    async getProfile(userId) {
        return this.usersService.findOne(userId);
    }
    async updateProfile(userId, dto) {
        return this.usersService.updateProfile(userId, dto.name, dto.phone, dto.gender);
    }
    async purchasePremiumMock(userId) {
        return this.usersService.purchasePremiumMock(userId);
    }
    async setProxy(userId, body) {
        return this.usersService.setProxy(userId, body.email);
    }
    async removeProxyPatch(userId) {
        return this.usersService.removeProxy(userId);
    }
    async removeProxyPost(userId) {
        return this.usersService.removeProxy(userId);
    }
    async requestEmailChange(userId, dto) {
        return this.usersService.requestEmailChange(userId, dto.newEmail);
    }
    async confirmEmailChange(userId, dto) {
        return this.usersService.confirmEmailChange(userId, dto.code);
    }
};
exports.UsersController = UsersController;
__decorate([
    (0, common_1.Get)('profile'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "getProfile", null);
__decorate([
    (0, common_1.Patch)('profile'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, UpdateProfileDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "updateProfile", null);
__decorate([
    (0, common_1.Post)('purchase-mock'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "purchasePremiumMock", null);
__decorate([
    (0, common_1.Post)('proxy'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "setProxy", null);
__decorate([
    (0, common_1.Patch)('proxy/remove'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "removeProxyPatch", null);
__decorate([
    (0, common_1.Post)('proxy/remove'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "removeProxyPost", null);
__decorate([
    (0, common_1.Post)('request-email-change'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, RequestEmailChangeDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "requestEmailChange", null);
__decorate([
    (0, common_1.Post)('confirm-email-change'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, ConfirmEmailChangeDto]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "confirmEmailChange", null);
exports.UsersController = UsersController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard),
    (0, common_1.Controller)('users'),
    __metadata("design:paramtypes", [users_service_1.UsersService])
], UsersController);
//# sourceMappingURL=users.controller.js.map