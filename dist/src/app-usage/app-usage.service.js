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
exports.AppUsageService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let AppUsageService = class AppUsageService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async checkCommonFamily(userId, targetUserId) {
        const common = await this.prisma.familyMember.findFirst({
            where: {
                userId: targetUserId,
                family: {
                    members: {
                        some: {
                            userId: userId,
                        },
                    },
                },
            },
        });
        return !!common;
    }
    async saveAppUsage(userId, usages) {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const promises = usages.map((usage) => {
            return this.prisma.appUsage.upsert({
                where: {
                    userId_packageName_recordedDate: {
                        userId,
                        packageName: usage.packageName,
                        recordedDate: startOfToday,
                    },
                },
                update: {
                    durationMin: usage.durationMin,
                    appName: usage.appName,
                    lastUsedAt: new Date(),
                },
                create: {
                    userId,
                    packageName: usage.packageName,
                    appName: usage.appName,
                    durationMin: usage.durationMin,
                    recordedDate: startOfToday,
                    lastUsedAt: new Date(),
                },
            });
        });
        await Promise.all(promises);
        return { success: true };
    }
    async getMemberAppUsage(userId, targetUserId) {
        if (userId !== targetUserId) {
            const isShared = await this.checkCommonFamily(userId, targetUserId);
            if (!isShared) {
                throw new common_1.ForbiddenException('Bu üyenin uygulama kullanım verilerini görme yetkiniz yok.');
            }
        }
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        return this.prisma.appUsage.findMany({
            where: {
                userId: targetUserId,
                recordedDate: startOfToday,
            },
            orderBy: {
                durationMin: 'desc',
            },
        });
    }
};
exports.AppUsageService = AppUsageService;
exports.AppUsageService = AppUsageService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AppUsageService);
//# sourceMappingURL=app-usage.service.js.map