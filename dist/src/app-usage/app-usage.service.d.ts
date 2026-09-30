import { PrismaService } from '../prisma/prisma.service';
interface AppUsageSnapshotItem {
    packageName: string;
    appName: string;
    durationMin: number;
}
export declare class AppUsageService {
    private prisma;
    constructor(prisma: PrismaService);
    private isTrackableMember;
    private getIstanbulDateKey;
    private getIstanbulDayStartUtc;
    private getNextIstanbulDayStartUtc;
    checkCommonFamily(userId: string, targetUserId: string): Promise<boolean>;
    saveAppUsage(userId: string, usages: AppUsageSnapshotItem[], recordedDateStr?: string): Promise<{
        success: boolean;
        count: number;
    }>;
    getMemberAppUsage(userId: string, targetUserId: string): Promise<{
        id: string;
        userId: string;
        lastUsedAt: Date;
        recordedDate: Date;
        packageName: string;
        appName: string;
        durationMin: number;
    }[]>;
}
export {};
