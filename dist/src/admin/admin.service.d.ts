import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AdminQueryDto, AlertQueryDto, UserQueryDto } from './dto/admin-query.dto';
import { UpdateAdminUserDto } from './dto/update-user.dto';
import { LocationsGateway } from '../locations/locations.gateway';
export declare class AdminService {
    private readonly prisma;
    private readonly notificationsService;
    private readonly locationsGateway;
    constructor(prisma: PrismaService, notificationsService: NotificationsService, locationsGateway: LocationsGateway);
    dashboard(): Promise<{
        totals: {
            users: number;
            families: number;
            activeAlerts: number;
            premiumUsers: number;
            recentSos: number;
        };
        recentUsers: {
            id: string;
            email: string;
            name: string;
            role: string;
            createdAt: Date;
        }[];
        alertDistribution: {
            type: string;
            count: number;
        }[];
    }>;
    users(query: UserQueryDto): Promise<{
        items: {
            id: string;
            email: string;
            name: string;
            phone: string | null;
            role: string;
            trialEndsAt: Date;
            isPremium: boolean;
            premiumExpiresAt: Date | null;
            createdAt: Date;
            _count: {
                memberships: number;
                alerts: number;
            };
        }[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    user(id: string): Promise<{
        latestLocation: {
            latitude: number;
            longitude: number;
            batteryLevel: number | null;
            isCharging: boolean | null;
            connectionStatus: string;
            recordedAt: Date;
        } | null;
        id: string;
        email: string;
        name: string;
        phone: string | null;
        role: string;
        trialEndsAt: Date;
        isPremium: boolean;
        premiumExpiresAt: Date | null;
        deviceId: string | null;
        loginAllowed: boolean;
        createdAt: Date;
        devicePermissions: Prisma.JsonValue;
        memberships: ({
            family: {
                id: string;
                name: string;
            };
        } & {
            id: string;
            createdAt: Date;
            userId: string;
            familyId: string;
            memberType: import(".prisma/client").$Enums.MemberType;
            permissions: string[];
            muteNotifications: boolean;
            guardianTrackingEnabled: boolean;
        })[];
        alerts: {
            id: string;
            createdAt: Date;
            type: import(".prisma/client").$Enums.AlertType;
            message: string;
            userId: string;
            familyId: string;
            status: import(".prisma/client").$Enums.AlertStatus;
            title: string;
            metadata: Prisma.JsonValue | null;
            resolvedAt: Date | null;
            audibleWarningId: string | null;
        }[];
    }>;
    userHistory(adminId: string, userId: string, dateStr?: string): Promise<{
        id: string;
        latitude: number;
        longitude: number;
        speed: number | null;
        batteryLevel: number | null;
        recordedAt: Date;
    }[]>;
    latestLocations(): Promise<(({
        user: {
            id: string;
            email: string;
            name: string;
            role: string;
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
        movementStatus: string;
        recordedAt: Date;
        receivedAt: Date;
        devicePointId: string | null;
        filterVersion: string;
        deliveryMode: string;
        deferredReason: string | null;
    }) | null)[]>;
    updateUser(adminId: string, userId: string, dto: UpdateAdminUserDto): Promise<{
        id: string;
        email: string;
        name: string;
        role: string;
        trialEndsAt: Date;
        isPremium: boolean;
        premiumExpiresAt: Date | null;
    }>;
    private getDefaultPremiumExpiry;
    deleteUser(adminId: string, userId: string): Promise<{
        success: boolean;
    }>;
    resetDevice(adminId: string, userId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    families(query: AdminQueryDto): Promise<{
        items: ({
            _count: {
                alerts: number;
                members: number;
                safeZones: number;
            };
            owner: {
                id: string;
                email: string;
                name: string;
            };
        } & {
            id: string;
            name: string;
            createdAt: Date;
            updatedAt: Date;
            inviteCode: string | null;
            sosEncryptionKey: string | null;
            type: string;
            ownerId: string;
        })[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    family(id: string): Promise<{
        alerts: {
            id: string;
            createdAt: Date;
            type: import(".prisma/client").$Enums.AlertType;
            message: string;
            userId: string;
            familyId: string;
            status: import(".prisma/client").$Enums.AlertStatus;
            title: string;
            metadata: Prisma.JsonValue | null;
            resolvedAt: Date | null;
            audibleWarningId: string | null;
        }[];
        owner: {
            id: string;
            email: string;
            name: string;
            phone: string | null;
        };
        members: ({
            user: {
                id: string;
                email: string;
                name: string;
                phone: string | null;
                role: string;
            };
        } & {
            id: string;
            createdAt: Date;
            userId: string;
            familyId: string;
            memberType: import(".prisma/client").$Enums.MemberType;
            permissions: string[];
            muteNotifications: boolean;
            guardianTrackingEnabled: boolean;
        })[];
        safeZones: {
            id: string;
            name: string;
            createdAt: Date;
            latitude: number;
            longitude: number;
            familyId: string;
            radius: number;
            createdBy: string;
        }[];
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        inviteCode: string | null;
        sosEncryptionKey: string | null;
        type: string;
        ownerId: string;
    }>;
    deleteFamily(adminId: string, id: string): Promise<{
        success: boolean;
    }>;
    alerts(query: AlertQueryDto): Promise<{
        items: ({
            user: {
                id: string;
                email: string;
                name: string;
            };
            family: {
                id: string;
                name: string;
            };
        } & {
            id: string;
            createdAt: Date;
            type: import(".prisma/client").$Enums.AlertType;
            message: string;
            userId: string;
            familyId: string;
            status: import(".prisma/client").$Enums.AlertStatus;
            title: string;
            metadata: Prisma.JsonValue | null;
            resolvedAt: Date | null;
            audibleWarningId: string | null;
        })[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    resolveAlert(adminId: string, id: string): Promise<{
        id: string;
        createdAt: Date;
        type: import(".prisma/client").$Enums.AlertType;
        message: string;
        userId: string;
        familyId: string;
        status: import(".prisma/client").$Enums.AlertStatus;
        title: string;
        metadata: Prisma.JsonValue | null;
        resolvedAt: Date | null;
        audibleWarningId: string | null;
    }>;
    private ensureUser;
    logAction(adminId: string, action: string, targetId: string, details?: Prisma.InputJsonValue): Promise<void>;
    auditLogs(query: AdminQueryDto): Promise<{
        items: ({
            admin: {
                id: string;
                email: string;
                name: string;
            };
        } & {
            id: string;
            createdAt: Date;
            action: string;
            targetId: string;
            details: Prisma.JsonValue;
            adminId: string;
        })[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    broadcastNotification(adminId: string, target: 'guardians' | 'members' | 'all', title: string, message: string): Promise<{
        success: boolean;
        userCount: number;
    }>;
    deleteUserTodayLocations(adminId: string, userId: string): Promise<{
        success: boolean;
        count: number;
    }>;
    deleteAllTodayLocations(adminId: string): Promise<{
        success: boolean;
        count: number;
    }>;
    private paginated;
}
