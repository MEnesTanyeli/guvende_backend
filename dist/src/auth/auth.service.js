"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const bcrypt = __importStar(require("bcrypt"));
const prisma_service_1 = require("../prisma/prisma.service");
const users_service_1 = require("../users/users.service");
let AuthService = class AuthService {
    prisma;
    jwtService;
    usersService;
    constructor(prisma, jwtService, usersService) {
        this.prisma = prisma;
        this.jwtService = jwtService;
        this.usersService = usersService;
    }
    async register(dto) {
        const existingUser = await this.prisma.user.findUnique({
            where: { email: dto.email.toLowerCase() },
        });
        if (existingUser) {
            throw new common_1.ConflictException('Bu e-posta adresi zaten kullanımda.');
        }
        const passwordHash = await bcrypt.hash(dto.password, 10);
        const userRole = dto.role || 'guardian';
        const trialEndsAt = new Date();
        if (userRole === 'guardian') {
            trialEndsAt.setDate(trialEndsAt.getDate() + 3);
        }
        const user = await this.prisma.user.create({
            data: {
                email: dto.email.toLowerCase(),
                passwordHash,
                name: dto.name,
                phone: dto.phone,
                role: userRole,
                trialEndsAt,
                gender: dto.gender,
            },
        });
        const token = this.generateToken(user.id, user.email);
        const userProfile = await this.usersService.findOne(user.id);
        return {
            message: 'Kayıt işlemi başarıyla tamamlandı.',
            token,
            user: userProfile,
        };
    }
    async login(dto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email.toLowerCase() },
            include: {
                memberships: true,
            },
        });
        if (!user) {
            throw new common_1.UnauthorizedException('E-posta veya şifre hatalı.');
        }
        const isPasswordValid = await bcrypt.compare(dto.password, user.passwordHash);
        if (!isPasswordValid) {
            throw new common_1.UnauthorizedException('E-posta veya şifre hatalı.');
        }
        const token = this.generateToken(user.id, user.email);
        const userProfile = await this.usersService.findOne(user.id);
        return {
            message: 'Giriş başarılı.',
            token,
            user: userProfile,
        };
    }
    async adminLogin(dto) {
        const result = await this.login(dto);
        if (result.user.role !== 'admin') {
            throw new common_1.ForbiddenException('Bu hesap yönetim paneline erişemez.');
        }
        return result;
    }
    generateToken(userId, email) {
        const payload = { sub: userId, email };
        return this.jwtService.sign(payload);
    }
    async forgotPassword(email) {
        const user = await this.prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });
        if (!user) {
            throw new common_1.NotFoundException('Bu e-posta adresine kayıtlı kullanıcı bulunamadı.');
        }
        const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
        const resetExpires = new Date();
        resetExpires.setMinutes(resetExpires.getMinutes() + 10);
        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                resetOtpCode: resetCode,
                resetOtpExpiresAt: resetExpires,
            },
        });
        console.log(`\n==================================================`);
        console.log(`🔑 ŞİFRE SIFIRLAMA KODU (${email}): ${resetCode}`);
        console.log(`==================================================\n`);
        return {
            message: 'Şifre sıfırlama kodu başarıyla oluşturuldu (Loglara yazdırıldı).',
        };
    }
    async resetPassword(dto) {
        const user = await this.prisma.user.findUnique({
            where: { email: dto.email.toLowerCase() },
        });
        if (!user) {
            throw new common_1.NotFoundException('Kullanıcı bulunamadı.');
        }
        if (!user.resetOtpCode || user.resetOtpCode !== dto.code) {
            throw new common_1.BadRequestException('Geçersiz sıfırlama kodu.');
        }
        if (!user.resetOtpExpiresAt || user.resetOtpExpiresAt < new Date()) {
            throw new common_1.BadRequestException('Sıfırlama kodunun süresi dolmuş.');
        }
        const passwordHash = await bcrypt.hash(dto.newPassword, 10);
        await this.prisma.user.update({
            where: { id: user.id },
            data: {
                passwordHash,
                resetOtpCode: null,
                resetOtpExpiresAt: null,
            },
        });
        return {
            message: 'Şifreniz başarıyla sıfırlandı. Yeni şifrenizle giriş yapabilirsiniz.',
        };
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        jwt_1.JwtService,
        users_service_1.UsersService])
], AuthService);
//# sourceMappingURL=auth.service.js.map