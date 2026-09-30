import { SafeZonesService } from './safe-zones.service';
import { CreateSafeZoneDto } from './dto/create-safe-zone.dto';
export declare class SafeZonesController {
    private safeZonesService;
    constructor(safeZonesService: SafeZonesService);
    create(userId: string, familyId: string, dto: CreateSafeZoneDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        latitude: number;
        longitude: number;
        familyId: string;
        radius: number;
        createdBy: string;
    }>;
    findAll(userId: string, familyId: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        latitude: number;
        longitude: number;
        familyId: string;
        radius: number;
        createdBy: string;
    }[]>;
    remove(userId: string, id: string): Promise<{
        message: string;
    }>;
}
