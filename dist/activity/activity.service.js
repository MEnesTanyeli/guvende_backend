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
exports.ActivityService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let ActivityService = class ActivityService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    getDistanceInMeters(lat1, lon1, lat2, lon2) {
        const R = 6371000;
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * (Math.PI / 180)) *
                Math.cos(lat2 * (Math.PI / 180)) *
                Math.sin(dLon / 2) *
                Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
    async getDailyActivity(userId, dateStr) {
        const targetDate = dateStr ? new Date(dateStr) : new Date();
        const startOfDay = new Date(targetDate);
        startOfDay.setHours(0, 0, 0, 0);
        const endOfDay = new Date(targetDate);
        endOfDay.setHours(23, 59, 59, 999);
        const existingSnapshot = await this.prisma.activitySnapshot.findUnique({
            where: {
                userId_date: {
                    userId,
                    date: startOfDay,
                },
            },
        });
        if (existingSnapshot) {
            return existingSnapshot;
        }
        const locations = await this.prisma.location.findMany({
            where: {
                userId,
                recordedAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
            },
            orderBy: { recordedAt: 'asc' },
        });
        let totalDistance = 0;
        for (let i = 0; i < locations.length - 1; i++) {
            const dist = this.getDistanceInMeters(locations[i].latitude, locations[i].longitude, locations[i + 1].latitude, locations[i + 1].longitude);
            if (dist > 5) {
                totalDistance += dist;
            }
        }
        const activeMinutes = Math.round(totalDistance / 70);
        const visitedZones = await this.prisma.alert.findMany({
            where: {
                userId,
                createdAt: {
                    gte: startOfDay,
                    lte: endOfDay,
                },
                type: {
                    in: ['safe_zone_enter', 'safe_zone_exit'],
                },
            },
        });
        const uniqueVisitedZones = new Set(visitedZones.map((z) => z.metadata?.safeZoneId).filter(Boolean));
        const visitedPlacesCount = Math.max(1, uniqueVisitedZones.size + 1);
        const isToday = new Date().toDateString() === targetDate.toDateString();
        const snapshotData = {
            userId,
            date: startOfDay,
            totalDistance: Math.round(totalDistance * 100) / 100,
            activeMinutes,
            visitedPlacesCount,
        };
        if (!isToday && locations.length > 0) {
            return this.prisma.activitySnapshot.create({
                data: snapshotData,
            });
        }
        return {
            id: 'temporary_today_snapshot',
            ...snapshotData,
            createdAt: new Date(),
        };
    }
};
exports.ActivityService = ActivityService;
exports.ActivityService = ActivityService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ActivityService);
//# sourceMappingURL=activity.service.js.map