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
const client_1 = require("@prisma/client");
const prisma_service_1 = require("../prisma/prisma.service");
const tracking_data_authorization_1 = require("../common/tracking-data-authorization");
let AppUsageService = class AppUsageService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    isTrackableMember(member) {
        return (member.memberType === client_1.MemberType.child ||
            member.memberType === client_1.MemberType.elder ||
            member.guardianTrackingEnabled);
    }
    getIstanbulDateKey(date = new Date()) {
        const parts = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Europe/Istanbul',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).formatToParts(date);
        const get = (type) => parts.find((part) => part.type === type)?.value;
        return `${get('year')}-${get('month')}-${get('day')}`;
    }
    getIstanbulDayStartUtc(dateStr) {
        const dateKey = dateStr && /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
            ? dateStr
            : this.getIstanbulDateKey();
        const [year, month, day] = dateKey.split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, day, -3, 0, 0, 0));
    }
    getNextIstanbulDayStartUtc(date) {
        const [year, month, day] = this.getIstanbulDateKey(date)
            .split('-')
            .map(Number);
        return new Date(Date.UTC(year, month - 1, day + 1, -3, 0, 0, 0));
    }
    async checkCommonFamily(userId, targetUserId) {
        const common = await this.prisma.familyMember.findFirst({
            where: {
                userId: targetUserId,
                family: {
                    members: {
                        some: {
                            userId,
                        },
                    },
                },
            },
        });
        return !!common && this.isTrackableMember(common);
    }
    async saveAppUsage(userId, usages, recordedDateStr) {
        const recordedDate = this.getIstanbulDayStartUtc(recordedDateStr);
        const now = new Date();
        const normalizedUsages = usages
            .map((usage) => ({
            packageName: usage.packageName.trim(),
            appName: usage.appName.trim(),
            durationMin: usage.durationMin,
        }))
            .filter((usage) => usage.packageName.length > 0 &&
            usage.appName.length > 0 &&
            usage.durationMin > 0);
        const packageNames = normalizedUsages.map((usage) => usage.packageName);
        await this.prisma.$transaction([
            this.prisma.appUsage.deleteMany({
                where: {
                    userId,
                    recordedDate,
                    ...(packageNames.length > 0
                        ? { packageName: { notIn: packageNames } }
                        : {}),
                },
            }),
            ...normalizedUsages.map((usage) => this.prisma.appUsage.upsert({
                where: {
                    userId_packageName_recordedDate: {
                        userId,
                        packageName: usage.packageName,
                        recordedDate,
                    },
                },
                create: {
                    userId,
                    packageName: usage.packageName,
                    appName: usage.appName,
                    durationMin: usage.durationMin,
                    recordedDate,
                    lastUsedAt: now,
                },
                update: {
                    appName: usage.appName,
                    durationMin: usage.durationMin,
                    lastUsedAt: now,
                },
            })),
        ]);
        return { success: true, count: normalizedUsages.length };
    }
    async getMemberAppUsage(userId, targetUserId) {
        if (userId !== targetUserId) {
            const isShared = await this.checkCommonFamily(userId, targetUserId);
            const authorizedFrom = await (0, tracking_data_authorization_1.assertCanReadTrackingData)(this.prisma, userId, targetUserId, { includeTemporalBoundary: true });
            if (!isShared) {
                throw new common_1.ForbiddenException('Bu üyenin uygulama kullanım verilerini görme yetkiniz yok.');
            }
            if (!authorizedFrom ||
                this.getIstanbulDayStartUtc() <
                    this.getNextIstanbulDayStartUtc(authorizedFrom)) {
                return [];
            }
        }
        return this.prisma.appUsage.findMany({
            where: {
                userId: targetUserId,
                recordedDate: this.getIstanbulDayStartUtc(),
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