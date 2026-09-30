import { ActivityService } from './activity.service';
import { GetDailyActivityQueryDto } from './dto/get-daily-activity-query.dto';
export declare class ActivityController {
    private activityService;
    constructor(activityService: ActivityService);
    getDailyActivity(userId: string, query: GetDailyActivityQueryDto): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        date: Date;
        totalDistance: number;
        activeMinutes: number;
        visitedPlacesCount: number;
    }>;
}
