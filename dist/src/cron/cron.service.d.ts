import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LocationsGateway } from '../locations/locations.gateway';
export declare class CronService {
    private prisma;
    private notificationsService;
    private locationsGateway;
    private readonly logger;
    constructor(prisma: PrismaService, notificationsService: NotificationsService, locationsGateway: LocationsGateway);
    private getDistanceInMeters;
    handleConnectionLostCheck(): Promise<void>;
    handleInactivityCheck(): Promise<void>;
    handleMedicationReminderCheck(): Promise<void>;
    handleSilentPingCheck(): Promise<void>;
    handleLocationsCleanup(): Promise<void>;
    handleSessionsCleanup(): Promise<void>;
}
