import { UsersService } from './users.service';
declare class UpdateProfileDto {
    name?: string;
    phone?: string;
    gender?: string;
}
export declare class UsersController {
    private usersService;
    constructor(usersService: UsersService);
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
    setProxy(userId: string, body: {
        email: string;
    }): Promise<{
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
    updateDevicePermissions(userId: string, dto: any): Promise<{
        success: boolean;
    }>;
}
export {};
