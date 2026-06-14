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
exports.MedicationsController = void 0;
const common_1 = require("@nestjs/common");
const medications_service_1 = require("./medications.service");
const jwt_auth_guard_1 = require("../auth/guards/jwt-auth.guard");
const subscription_guard_1 = require("../auth/guards/subscription.guard");
const get_user_decorator_1 = require("../auth/decorators/get-user.decorator");
const create_medication_dto_1 = require("./dto/create-medication.dto");
const update_medication_dto_1 = require("./dto/update-medication.dto");
let MedicationsController = class MedicationsController {
    medicationsService;
    constructor(medicationsService) {
        this.medicationsService = medicationsService;
    }
    async createReminder(creatorId, dto) {
        return this.medicationsService.createReminder(creatorId, dto);
    }
    async getReminders(userId) {
        return this.medicationsService.getReminders(userId);
    }
    async deleteReminder(deleterId, reminderId) {
        return this.medicationsService.deleteReminder(reminderId, deleterId);
    }
    async takeMedication(userId, reminderId) {
        return this.medicationsService.takeMedication(reminderId, userId);
    }
    async updateReminder(updaterId, reminderId, dto) {
        return this.medicationsService.updateReminder(reminderId, updaterId, dto);
    }
};
exports.MedicationsController = MedicationsController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, create_medication_dto_1.CreateMedicationDto]),
    __metadata("design:returntype", Promise)
], MedicationsController.prototype, "createReminder", null);
__decorate([
    (0, common_1.Get)('user/:userId'),
    __param(0, (0, common_1.Param)('userId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], MedicationsController.prototype, "getReminders", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MedicationsController.prototype, "deleteReminder", null);
__decorate([
    (0, common_1.Post)(':id/take'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], MedicationsController.prototype, "takeMedication", null);
__decorate([
    (0, common_1.Patch)(':id'),
    __param(0, (0, get_user_decorator_1.GetUser)('id')),
    __param(1, (0, common_1.Param)('id')),
    __param(2, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, update_medication_dto_1.UpdateMedicationDto]),
    __metadata("design:returntype", Promise)
], MedicationsController.prototype, "updateReminder", null);
exports.MedicationsController = MedicationsController = __decorate([
    (0, common_1.UseGuards)(jwt_auth_guard_1.JwtAuthGuard, subscription_guard_1.SubscriptionGuard),
    (0, common_1.Controller)('medications'),
    __metadata("design:paramtypes", [medications_service_1.MedicationsService])
], MedicationsController);
//# sourceMappingURL=medications.controller.js.map