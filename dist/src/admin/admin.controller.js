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
exports.AdminController = void 0;
const common_1 = require("@nestjs/common");
const get_user_decorator_1 = require("../auth/decorators/get-user.decorator");
const admin_guard_1 = require("../auth/guards/admin.guard");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const admin_service_1 = require("./admin.service");
const admin_query_dto_1 = require("./dto/admin-query.dto");
const update_user_dto_1 = require("./dto/update-user.dto");
let AdminController = class AdminController {
    adminService;
    constructor(adminService) {
        this.adminService = adminService;
    }
    dashboard() { return this.adminService.dashboard(); }
    users(query) { return this.adminService.users(query); }
    user(id) { return this.adminService.user(id); }
    userHistory(adminId, userId, dateStr) {
        return this.adminService.userHistory(adminId, userId, dateStr);
    }
    updateUser(adminId, id, dto) {
        return this.adminService.updateUser(adminId, id, dto);
    }
    resetDevice(adminId, id) {
        return this.adminService.resetDevice(adminId, id);
    }
    deleteUser(adminId, id) {
        return this.adminService.deleteUser(adminId, id);
    }
    deleteUserTodayLocations(adminId, userId) {
        return this.adminService.deleteUserTodayLocations(adminId, userId);
    }
    deleteAllTodayLocations(adminId) {
        return this.adminService.deleteAllTodayLocations(adminId);
    }
    families(query) { return this.adminService.families(query); }
    family(id) { return this.adminService.family(id); }
    latestLocations() {
        return this.adminService.latestLocations();
    }
    deleteFamily(adminId, id) {
        return this.adminService.deleteFamily(adminId, id);
    }
    alerts(query) { return this.adminService.alerts(query); }
    resolveAlert(adminId, id) {
        return this.adminService.resolveAlert(adminId, id);
    }
    auditLogs(query) {
        return this.adminService.auditLogs(query);
    }
    broadcast(adminId, target, title, message) {
        return this.adminService.broadcastNotification(adminId, target, title, message);
    }
};
exports.AdminController = AdminController;
__decorate([
    (0, common_1.Get)('dashboard'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "dashboard", null);
__decorate([
    (0, common_1.Get)('users'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_query_dto_1.UserQueryDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "users", null);
__decorate([
    (0, common_1.Get)('users/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "user", null);
__decorate([
    (0, common_1.Get)('users/:userId/locations/history'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('userId')),
    __param(2, (0, common_1.Query)('date')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "userHistory", null);
__decorate([
    (0, common_1.Patch)('users/:id'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_user_dto_1.UpdateAdminUserDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "updateUser", null);
__decorate([
    (0, common_1.Patch)('users/:id/reset-device'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "resetDevice", null);
__decorate([
    (0, common_1.Delete)('users/:id'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deleteUser", null);
__decorate([
    (0, common_1.Delete)('users/:userId/locations/today'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deleteUserTodayLocations", null);
__decorate([
    (0, common_1.Delete)('locations/today'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deleteAllTodayLocations", null);
__decorate([
    (0, common_1.Get)('families'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_query_dto_1.AdminQueryDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "families", null);
__decorate([
    (0, common_1.Get)('families/:id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "family", null);
__decorate([
    (0, common_1.Get)('locations/latest'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "latestLocations", null);
__decorate([
    (0, common_1.Delete)('families/:id'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "deleteFamily", null);
__decorate([
    (0, common_1.Get)('alerts'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_query_dto_1.AlertQueryDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "alerts", null);
__decorate([
    (0, common_1.Patch)('alerts/:id/resolve'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "resolveAlert", null);
__decorate([
    (0, common_1.Get)('audit-logs'),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_query_dto_1.AdminQueryDto]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "auditLogs", null);
__decorate([
    (0, common_1.Post)('notifications/broadcast'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)('target')),
    __param(2, (0, common_1.Body)('title')),
    __param(3, (0, common_1.Body)('message')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", void 0)
], AdminController.prototype, "broadcast", null);
exports.AdminController = AdminController = __decorate([
    (0, common_1.Controller)('admin'),
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, admin_guard_1.AdminGuard),
    __metadata("design:paramtypes", [admin_service_1.AdminService])
], AdminController);
//# sourceMappingURL=admin.controller.js.map