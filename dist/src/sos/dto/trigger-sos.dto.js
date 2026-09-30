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
exports.TriggerSosDto = void 0;
const class_validator_1 = require("class-validator");
class TriggerSosDto {
    eventId;
    latitude;
    longitude;
    message;
}
exports.TriggerSosDto = TriggerSosDto;
__decorate([
    (0, class_validator_1.IsUUID)('4', { message: 'eventId geçerli bir UUID v4 olmalıdır.' }),
    __metadata("design:type", String)
], TriggerSosDto.prototype, "eventId", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({}, { message: 'Enlem (latitude) geçerli bir sayı olmalıdır.' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Enlem boş bırakılamaz.' }),
    __metadata("design:type", Number)
], TriggerSosDto.prototype, "latitude", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({}, { message: 'Boylam (longitude) geçerli bir sayı olmalıdır.' }),
    (0, class_validator_1.IsNotEmpty)({ message: 'Boylam boş bırakılamaz.' }),
    __metadata("design:type", Number)
], TriggerSosDto.prototype, "longitude", void 0);
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.IsOptional)(),
    __metadata("design:type", String)
], TriggerSosDto.prototype, "message", void 0);
//# sourceMappingURL=trigger-sos.dto.js.map