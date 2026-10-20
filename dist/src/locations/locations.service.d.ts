import { PrismaService } from '../prisma/prisma.service';
import { RecordLocationDto } from './dto/record-location.dto';
import { RecordBulkLocationsDto } from './dto/record-bulk-locations.dto';
import { LocationsGateway } from './locations.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { AckAudibleWarningDto } from './dto/ack-audible-warning.dto';
import { SubscriptionEntitlementService } from '../common/subscription-entitlement.service';
import { LocationRateLimitService } from './location-rate-limit.service';
import { LocationHardQuotaService } from './location-hard-quota.service';
export declare class LocationsService {
    private prisma;
    private locationsGateway;
    private notificationsService;
    private subscriptionEntitlement;
    private locationRateLimit;
    private locationHardQuota;
    private readonly logger;
    constructor(prisma: PrismaService, locationsGateway: LocationsGateway, notificationsService: NotificationsService, subscriptionEntitlement: SubscriptionEntitlementService, locationRateLimit: LocationRateLimitService, locationHardQuota: LocationHardQuotaService);
    private getIstanbulDateKey;
    private getIstanbulDayRangeUtc;
    recordLocation(userId: string, dto: RecordLocationDto, broadcastLocation?: boolean): Promise<{
        id: string;
        userId: string;
        latitude: number;
        longitude: number;
        accuracy: number | null;
        speed: number | null;
        batteryLevel: number | null;
        isCharging: boolean | null;
        connectionStatus: string;
        movementStatus: string;
        recordedAt: Date;
        receivedAt: Date;
        devicePointId: string | null;
        filterVersion: string;
        deliveryMode: string;
        deferredReason: string | null;
    }>;
    private persistLocation;
    recordBulkLocations(userId: string, dto: RecordBulkLocationsDto): Promise<{
        success: boolean;
        count: number;
        acceptedIds: never[];
        duplicateIds: never[];
        rejectedItems: never[];
        latestLocation?: undefined;
    } | {
        success: boolean;
        count: number;
        acceptedIds: string[];
        duplicateIds: string[];
        rejectedItems: {
            devicePointId: string;
            reason: string;
        }[];
        latestLocation: {
            id: string;
            userId: string;
            latitude: number;
            longitude: number;
            accuracy: number | null;
            speed: number | null;
            batteryLevel: number | null;
            isCharging: boolean | null;
            connectionStatus: string;
            movementStatus: string;
            recordedAt: Date;
            receivedAt: Date;
            devicePointId: string | null;
            filterVersion: string;
            deliveryMode: string;
            deferredReason: string | null;
        } | null;
    }>;
    private recordBulkLocationsLocked;
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
        movementStatus: string;
        recordedAt: Date;
        receivedAt: Date;
        devicePointId: string | null;
        filterVersion: string;
        deliveryMode: string;
        deferredReason: string | null;
    }[]>;
    getLocationsHistory(userId: string, familyId: string, targetUserId: string, dateStr?: string): Promise<{
        id: string;
        latitude: number;
        longitude: number;
        accuracy: number | null;
        speed: number | null;
        batteryLevel: number | null;
        connectionStatus: string;
        movementStatus: string;
        recordedAt: Date;
        receivedAt: Date;
        devicePointId: string | null;
        filterVersion: string;
        deliveryMode: string;
        deferredReason: string | null;
    }[]>;
    sendAudibleWarning(senderId: string, targetUserId: string, eventId: string): Promise<{
        success: boolean;
        warningId: string;
        idempotent: boolean;
    }>;
    ackAudibleWarning(authenticatedUserId: string, dto: AckAudibleWarningDto): Promise<{
        success: boolean;
        duplicate: boolean;
    }>;
    triggerTestLocationEvent(userId: string, familyId: string, targetUserId: string): Promise<{
        success: boolean;
    }>;
}
