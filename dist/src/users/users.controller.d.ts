import { UsersService } from './users.service';
declare class RequestEmailChangeDto {
    newEmail: string;
}
declare class ConfirmEmailChangeDto {
    code: string;
}
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
        createdAt: Date;
    }>;
    purchasePremiumMock(userId: string): Promise<{
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
        createdAt: Date;
    }>;
    requestEmailChange(userId: string, dto: RequestEmailChangeDto): Promise<{
        message: string;
    }>;
    confirmEmailChange(userId: string, dto: ConfirmEmailChangeDto): Promise<{
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
        createdAt: Date;
    }>;
}
export {};
