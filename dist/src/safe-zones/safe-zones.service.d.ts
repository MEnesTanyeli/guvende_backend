import { PrismaService } from '../prisma/prisma.service';
import { CreateSafeZoneDto } from './dto/create-safe-zone.dto';
import { SubscriptionEntitlementService } from '../common/subscription-entitlement.service';
export declare class SafeZonesService {
    private prisma;
    private subscriptionEntitlement;
    constructor(prisma: PrismaService, subscriptionEntitlement: SubscriptionEntitlementService);
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
    remove(userId: string, safeZoneId: string): Promise<{
        message: string;
    }>;
}
