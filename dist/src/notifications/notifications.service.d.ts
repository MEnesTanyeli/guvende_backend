import { PrismaService } from '../prisma/prisma.service';
import { LocationsGateway } from '../locations/locations.gateway';
export declare class NotificationsService {
    private prisma;
    private locationsGateway;
    private readonly logger;
    constructor(prisma: PrismaService, locationsGateway: LocationsGateway);
    private sendOneSignalNotification;
    sendNotification(userId: string, title: string, message: string, data?: any): Promise<{
        success: boolean;
        userId: string;
        title: string;
        message: string;
    }>;
    sendFamilyNotification(familyId: string, senderId: string, title: string, message: string, data?: any): Promise<{
        success: boolean;
        recipientsCount: number;
    }>;
}
