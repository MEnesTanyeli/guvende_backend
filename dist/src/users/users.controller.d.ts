import { UsersService } from './users.service';
import { SetProxyDto } from './dto/set-proxy.dto';
import { UpdateDevicePermissionsDto } from './dto/update-device-permissions.dto';
declare class DeleteAccountDto {
    password: string;
}
declare class UpdateProfileDto {
    name?: string;
    phone?: string;
    gender?: string;
}
export declare class UsersController {
    private usersService;
    constructor(usersService: UsersService);
    deletionInfo(userId: string): Promise<{
        ownsFamilies: boolean;
        hasActiveEntitlement: boolean;
    }>;
    deleteAccount(userId: string, dto: DeleteAccountDto): Promise<{
        success: boolean;
    }>;
    getProfile(userId: string): Promise<{
        id: string;
        email: string;
        name: string;
        phone: string | null;
        role: string;
        gender: string | null;
        trialEndsAt: Date;
        isPremium: boolean | null;
        premiumExpiresAt: Date | null;
        isGuardian: boolean;
        isInFamily: boolean;
        isProxy: boolean;
        proxy: {
            id: string;
            email: string;
            name: string;
        } | null;
        isLocked: boolean;
        devicePermissions: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
    }>;
    updateProfile(userId: string, dto: UpdateProfileDto): Promise<{
        id: string;
        email: string;
        name: string;
        phone: string | null;
        role: string;
        gender: string | null;
        trialEndsAt: Date;
        isPremium: boolean | null;
        premiumExpiresAt: Date | null;
        isGuardian: boolean;
        isInFamily: boolean;
        isProxy: boolean;
        proxy: {
            id: string;
            email: string;
            name: string;
        } | null;
        isLocked: boolean;
        devicePermissions: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
    }>;
    setProxy(userId: string, dto: SetProxyDto): Promise<{
        id: string;
        email: string;
        name: string;
        phone: string | null;
        role: string;
        gender: string | null;
        trialEndsAt: Date;
        isPremium: boolean | null;
        premiumExpiresAt: Date | null;
        isGuardian: boolean;
        isInFamily: boolean;
        isProxy: boolean;
        proxy: {
            id: string;
            email: string;
            name: string;
        } | null;
        isLocked: boolean;
        devicePermissions: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
    }>;
    removeProxyPatch(userId: string): Promise<{
        id: string;
        email: string;
        name: string;
        phone: string | null;
        role: string;
        gender: string | null;
        trialEndsAt: Date;
        isPremium: boolean | null;
        premiumExpiresAt: Date | null;
        isGuardian: boolean;
        isInFamily: boolean;
        isProxy: boolean;
        proxy: {
            id: string;
            email: string;
            name: string;
        } | null;
        isLocked: boolean;
        devicePermissions: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
    }>;
    removeProxyPost(userId: string): Promise<{
        id: string;
        email: string;
        name: string;
        phone: string | null;
        role: string;
        gender: string | null;
        trialEndsAt: Date;
        isPremium: boolean | null;
        premiumExpiresAt: Date | null;
        isGuardian: boolean;
        isInFamily: boolean;
        isProxy: boolean;
        proxy: {
            id: string;
            email: string;
            name: string;
        } | null;
        isLocked: boolean;
        devicePermissions: import("@prisma/client/runtime/library").JsonValue;
        createdAt: Date;
    }>;
    resetDevice(guardianId: string, childId: string): Promise<{
        message: string;
    }>;
    updateDevicePermissions(userId: string, dto: UpdateDevicePermissionsDto): Promise<{
        success: boolean;
    }>;
}
export {};
