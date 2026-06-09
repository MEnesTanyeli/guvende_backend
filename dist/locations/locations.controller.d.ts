import { LocationsService } from './locations.service';
import { RecordLocationDto } from './dto/record-location.dto';
export declare class LocationsController {
    private locationsService;
    constructor(locationsService: LocationsService);
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
