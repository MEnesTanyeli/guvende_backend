import { PrismaService } from '../prisma/prisma.service';
import { RecordLocationDto } from './dto/record-location.dto';
import { LocationsGateway } from './locations.gateway';
import { NotificationsService } from '../notifications/notifications.service';
export declare class LocationsService {
    private prisma;
    private locationsGateway;
    private notificationsService;
    constructor(prisma: PrismaService, locationsGateway: LocationsGateway, notificationsService: NotificationsService);
    private getDistanceInMeters;
    recordLocation(userId: string, dto: RecordLocationDto): Promise<{
        user: {
            id: string;
            email: string;
            name: string;
        };
    } & {
        id: string;
        userId: string;
        latitude: number;
        longitude: number;
        accuracy: number | null;
        speed: number | null;
        batteryLevel: number | null;
        isCharging: boolean | null;
        connectionStatus: string;
        recordedAt: Date;
    }>;
    getLatestLocations(userId: string, familyId: string): Promise<{
        insideZoneName: string | null;
        user: {
            id: string;
            email: string;
            name: string;
            phone: string | null;
        };
        id: string;
        userId: string;
        latitude: number;
        longitude: number;
        accuracy: number | null;
        speed: number | null;
        batteryLevel: number | null;
        isCharging: boolean | null;
        connectionStatus: string;
        recordedAt: Date;
    }[]>;
    getLocationsHistory(userId: string, familyId: string, targetUserId: string, dateStr?: string): Promise<{
        id: string;
        latitude: number;
        longitude: number;
        speed: number | null;
        batteryLevel: number | null;
        recordedAt: Date;
    }[]>;
    sendAudibleWarning(senderId: string, targetUserId: string): Promise<{
        success: boolean;
        message: string;
    }>;
}
