import { LocationsService } from './locations.service';
import { RecordLocationDto } from './dto/record-location.dto';
export declare class LocationsController {
    private locationsService;
    constructor(locationsService: LocationsService);
    recordLocation(userId: string, dto: RecordLocationDto): Promise<{
        user: {
            email: string;
            name: string;
            id: string;
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
    getLatestLocations(userId: string, familyId: string): Promise<({
        user: {
            email: string;
            name: string;
            phone: string | null;
            id: string;
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
    })[]>;
}
