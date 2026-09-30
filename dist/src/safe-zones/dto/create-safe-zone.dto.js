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
exports.CreateSafeZoneDto = void 0;
const class_validator_1 = require("class-validator");
class CreateSafeZoneDto {
    name;
    latitude;
    longitude;
    radius;
}
exports.CreateSafeZoneDto = CreateSafeZoneDto;
__decorate([
    (0, class_validator_1.IsString)(),
    (0, class_validator_1.MaxLength)(100),
    (0, class_validator_1.IsNotEmpty)({ message: 'Bölge ismi boş bırakılamaz.' }),
    __metadata("design:type", String)
], CreateSafeZoneDto.prototype, "name", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({}, { message: 'Enlem (latitude) geçerli bir sayı olmalıdır.' }),
    (0, class_validator_1.Min)(-90),
    (0, class_validator_1.Max)(90),
    __metadata("design:type", Number)
], CreateSafeZoneDto.prototype, "latitude", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({}, { message: 'Boylam (longitude) geçerli bir sayı olmalıdır.' }),
    (0, class_validator_1.Min)(-180),
    (0, class_validator_1.Max)(180),
    __metadata("design:type", Number)
], CreateSafeZoneDto.prototype, "longitude", void 0);
__decorate([
    (0, class_validator_1.IsNumber)({}, { message: 'Yarıçap (radius) geçerli bir sayı olmalıdır.' }),
    (0, class_validator_1.Min)(10, { message: 'Yarıçap en az 10 metre olmalıdır.' }),
    (0, class_validator_1.Max)(10000),
    __metadata("design:type", Number)
], CreateSafeZoneDto.prototype, "radius", void 0);
//# sourceMappingURL=create-safe-zone.dto.js.map