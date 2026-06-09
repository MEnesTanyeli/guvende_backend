import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
export declare class CronService {
    private prisma;
    private notificationsService;
    private readonly logger;
    constructor(prisma: PrismaService, notificationsService: NotificationsService);
    private getDistanceInMeters;
    handleConnectionLostCheck(): Promise<void>;
    handleInactivityCheck(): Promise<void>;
}
