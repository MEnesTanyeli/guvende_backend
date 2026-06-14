import { ActivityService } from './activity.service';
export declare class ActivityController {
    private activityService;
    constructor(activityService: ActivityService);
    getDailyActivity(userId: string, memberId?: string, date?: string): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        date: Date;
        totalDistance: number;
        activeMinutes: number;
        visitedPlacesCount: number;
    }>;
}
