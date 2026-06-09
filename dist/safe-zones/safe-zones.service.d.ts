import { PrismaService } from '../prisma/prisma.service';
import { CreateSafeZoneDto } from './dto/create-safe-zone.dto';
export declare class SafeZonesService {
    private prisma;
    constructor(prisma: PrismaService);
    create(userId: string, familyId: string, dto: CreateSafeZoneDto): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        familyId: string;
        latitude: number;
        longitude: number;
        radius: number;
        createdBy: string;
    }>;
    findAll(userId: string, familyId: string): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        familyId: string;
        latitude: number;
        longitude: number;
        radius: number;
        createdBy: string;
    }[]>;
    remove(userId: string, safeZoneId: string): Promise<{
        message: string;
    }>;
}
