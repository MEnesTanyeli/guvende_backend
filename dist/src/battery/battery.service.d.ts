import { PrismaService } from '../prisma/prisma.service';
import { UpdateBatteryDto } from './dto/update-battery.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionEntitlementService } from '../common/subscription-entitlement.service';
export declare class BatteryService {
    private prisma;
    private notificationsService;
    private subscriptionEntitlement;
    constructor(prisma: PrismaService, notificationsService: NotificationsService, subscriptionEntitlement: SubscriptionEntitlementService);
    private isTrackableMember;
    updateBattery(userId: string, dto: UpdateBatteryDto): Promise<{
        message: string;
        batteryLevel: number;
        isCharging: boolean;
    }>;
}
