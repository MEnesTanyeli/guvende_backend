import { PrismaService } from '../prisma/prisma.service';
export declare class NotificationsService {
    private prisma;
    private readonly logger;
    constructor(prisma: PrismaService);
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
