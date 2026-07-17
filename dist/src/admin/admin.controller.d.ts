import { AdminService } from './admin.service';
import { AdminQueryDto, AlertQueryDto, UserQueryDto } from './dto/admin-query.dto';
import { UpdateAdminUserDto } from './dto/update-user.dto';
export declare class AdminController {
    private readonly adminService;
    constructor(adminService: AdminService);
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
        devicePermissions: import("@prisma/client/runtime/library").JsonValue;
        memberships: ({
            family: {
                id: string;
                name: string;
            };
        } & {
            id: string;
            createdAt: Date;
            familyId: string;
            userId: string;
            memberType: import(".prisma/client").$Enums.MemberType;
            permissions: string[];
            muteNotifications: boolean;
        })[];
        alerts: {
            id: string;
            createdAt: Date;
            message: string;
            familyId: string;
            userId: string;
            type: import(".prisma/client").$Enums.AlertType;
            title: string;
            status: import(".prisma/client").$Enums.AlertStatus;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            resolvedAt: Date | null;
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
    updateUser(adminId: string, id: string, dto: UpdateAdminUserDto): Promise<{
        id: string;
        email: string;
        name: string;
        role: string;
        trialEndsAt: Date;
        isPremium: boolean;
        premiumExpiresAt: Date | null;
    }>;
    resetDevice(adminId: string, id: string): Promise<{
        success: boolean;
        message: string;
    }>;
    deleteUser(adminId: string, id: string): Promise<{
        success: boolean;
    }>;
    deleteUserTodayLocations(adminId: string, userId: string): Promise<{
        success: boolean;
        count: number;
    }>;
    deleteAllTodayLocations(adminId: string): Promise<{
        success: boolean;
        count: number;
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
            message: string;
            familyId: string;
            userId: string;
            type: import(".prisma/client").$Enums.AlertType;
            title: string;
            status: import(".prisma/client").$Enums.AlertStatus;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            resolvedAt: Date | null;
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
            familyId: string;
            userId: string;
            memberType: import(".prisma/client").$Enums.MemberType;
            permissions: string[];
            muteNotifications: boolean;
        })[];
        safeZones: {
            id: string;
            name: string;
            createdAt: Date;
            familyId: string;
            latitude: number;
            longitude: number;
            radius: number;
            createdBy: string;
        }[];
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        inviteCode: string | null;
        type: string;
        ownerId: string;
    }>;
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
        recordedAt: Date;
    }) | null)[]>;
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
            message: string;
            familyId: string;
            userId: string;
            type: import(".prisma/client").$Enums.AlertType;
            title: string;
            status: import(".prisma/client").$Enums.AlertStatus;
            metadata: import("@prisma/client/runtime/library").JsonValue | null;
            resolvedAt: Date | null;
        })[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    resolveAlert(adminId: string, id: string): Promise<{
        id: string;
        createdAt: Date;
        message: string;
        familyId: string;
        userId: string;
        type: import(".prisma/client").$Enums.AlertType;
        title: string;
        status: import(".prisma/client").$Enums.AlertStatus;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        resolvedAt: Date | null;
    }>;
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
            details: import("@prisma/client/runtime/library").JsonValue;
            adminId: string;
        })[];
        total: number;
        page: number;
        limit: number;
        pages: number;
    }>;
    broadcast(adminId: string, target: 'guardians' | 'members' | 'all', title: string, message: string): Promise<{
        success: boolean;
        userCount: number;
    }>;
}
