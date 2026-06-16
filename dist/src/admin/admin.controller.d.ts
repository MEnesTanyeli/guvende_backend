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
    updateUser(adminId: string, id: string, dto: UpdateAdminUserDto): Promise<{
        id: string;
        email: string;
        name: string;
        role: string;
        trialEndsAt: Date;
        isPremium: boolean;
        premiumExpiresAt: Date | null;
    }>;
    deleteUser(adminId: string, id: string): Promise<{
        success: boolean;
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
    deleteFamily(id: string): Promise<{
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
    resolveAlert(id: string): Promise<{
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
}
