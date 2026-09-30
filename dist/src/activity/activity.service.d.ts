import { PrismaService } from '../prisma/prisma.service';
export declare class ActivityService {
    private prisma;
    constructor(prisma: PrismaService);
    private getDistanceInMeters;
    getDailyActivity(requesterId: string, targetUserId: string, dateStr?: string): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        date: Date;
        totalDistance: number;
        activeMinutes: number;
        visitedPlacesCount: number;
    }>;
    private calculateDailyActivity;
}
