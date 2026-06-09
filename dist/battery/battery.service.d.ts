import { PrismaService } from '../prisma/prisma.service';
import { UpdateBatteryDto } from './dto/update-battery.dto';
import { NotificationsService } from '../notifications/notifications.service';
export declare class BatteryService {
    private prisma;
    private notificationsService;
    constructor(prisma: PrismaService, notificationsService: NotificationsService);
    updateBattery(userId: string, dto: UpdateBatteryDto): Promise<{
        message: string;
        batteryLevel: number;
        isCharging: boolean;
    }>;
}
