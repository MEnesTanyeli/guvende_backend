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
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecordLocationDto = void 0;
const class_validator_1 = require("class-validator");
class RecordLocationDto {
    latitude;
    longitude;
    accuracy;
    speed;
    batteryLevel;
    isCharging;
    connectionStatus;
    recordedAt;
    measuredAt;
    devicePointId;
    filterVersion;
    movementStatus;
    deliveryMode;
    deferredReason;
    insideZoneId;
    insideZoneName;
}
exports.RecordLocationDto = RecordLocationDto;
__decorate([
    (0, class_validator_1.IsNumber)({}, { message: 'Enlem (latitude) geçerli bir sayı olmalıdır.' }),
    (0, class_validator_1.Min)(-90),
    (0, class_validator_1.Max)(90),
    __metadata("design:type", Number)
], RecordLocationDto.prototype, "latitude", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({}, { message: 'Boylam (longitude) geçerli bir sayı olmalıdır.' }),
    (0, class_validator_1.Min)(-180),
    (0, class_validator_1.Max)(180),
    __metadata("design:type", Number)
], RecordLocationDto.prototype, "longitude", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], RecordLocationDto.prototype, "accuracy", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], RecordLocationDto.prototype, "speed", void 0);
__decorate([
    (0, class_validator_1.IsNumber)(),
    (0, class_validator_1.Min)(0),
    (0, class_validator_1.Max)(100),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Number)
], RecordLocationDto.prototype, "batteryLevel", void 0);
__decorate([
    (0, class_validator_1.IsBoolean)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", Boolean)
], RecordLocationDto.prototype, "isCharging", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['online', 'offline']),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], RecordLocationDto.prototype, "connectionStatus", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], RecordLocationDto.prototype, "recordedAt", void 0);
__decorate([
    (0, class_validator_1.IsDateString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], RecordLocationDto.prototype, "measuredAt", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], RecordLocationDto.prototype, "devicePointId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], RecordLocationDto.prototype, "filterVersion", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['unknown', 'moving', 'stationary']),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], RecordLocationDto.prototype, "movementStatus", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['live', 'deferred']),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], RecordLocationDto.prototype, "deliveryMode", void 0);
__decorate([
    (0, class_validator_1.IsIn)(['offline', 'timeout', 'server_error', 'app_restart']),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], RecordLocationDto.prototype, "deferredReason", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], RecordLocationDto.prototype, "insideZoneId", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], RecordLocationDto.prototype, "insideZoneName", void 0);
//# sourceMappingURL=record-location.dto.js.map