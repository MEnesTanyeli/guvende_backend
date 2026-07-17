import { PrismaService } from '../prisma/prisma.service';
export declare class AppUsageService {
    private prisma;
    constructor(prisma: PrismaService);
    checkCommonFamily(userId: string, targetUserId: string): Promise<boolean>;
    saveAppUsage(userId: string, usages: Array<{
        packageName: string;
        appName: string;
        durationMin: number;
    }>, recordedDateStr?: string): Promise<{
        success: boolean;
    }>;
    getMemberAppUsage(userId: string, targetUserId: string): Promise<{
        id: string;
        userId: string;
        lastUsedAt: Date;
        packageName: string;
        appName: string;
        durationMin: number;
        recordedDate: Date;
    }[]>;
}
