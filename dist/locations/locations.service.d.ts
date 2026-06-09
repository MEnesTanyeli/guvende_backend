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
            name: string;
            email: string;
        };
    } & {
        id: string;
        latitude: number;
        longitude: number;
        accuracy: number | null;
        speed: number | null;
        batteryLevel: number | null;
        isCharging: boolean | null;
        connectionStatus: string;
        recordedAt: Date;
        userId: string;
    }>;
    getLatestLocations(userId: string, familyId: string): Promise<({
        user: {
            id: string;
            name: string;
            email: string;
            phone: string | null;
        };
    } & {
        id: string;
        latitude: number;
        longitude: number;
        accuracy: number | null;
        speed: number | null;
        batteryLevel: number | null;
        isCharging: boolean | null;
        connectionStatus: string;
        recordedAt: Date;
        userId: string;
    })[]>;
}
