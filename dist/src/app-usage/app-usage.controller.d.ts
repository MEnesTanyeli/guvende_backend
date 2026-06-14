import { AppUsageService } from './app-usage.service';
import { SaveAppUsageDto } from './dto/save-app-usage.dto';
export declare class AppUsageController {
    private appUsageService;
    constructor(appUsageService: AppUsageService);
    saveAppUsage(userId: string, dto: SaveAppUsageDto): Promise<{
        success: boolean;
    }>;
    getMemberAppUsage(userId: string, memberId: string): Promise<{
        id: string;
        userId: string;
        packageName: string;
        appName: string;
        durationMin: number;
        lastUsedAt: Date;
        recordedDate: Date;
    }[]>;
}
