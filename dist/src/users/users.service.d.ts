import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LocationsGateway } from '../locations/locations.gateway';
import { OfflineSosService } from '../offline-sos/offline-sos.service';
import { FamilyMembershipLockService } from '../common/family-membership-lock.service';
export declare class UsersService {
    private prisma;
    private locationsGateway;
    private offlineSosService;
    private familyMembershipLock;
    constructor(prisma: PrismaService, locationsGateway: LocationsGateway, offlineSosService: OfflineSosService, familyMembershipLock?: FamilyMembershipLockService);
    private lockProxyMutation;
    accountDeletionInfo(userId: string): Promise<{
        ownsFamilies: boolean;
        hasActiveEntitlement: boolean;
    }>;
    deleteAccount(userId: string, password: string): Promise<{
        success: boolean;
    }>;
    findOne(id: string): Promise<{
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
        devicePermissions: Prisma.JsonValue;
        createdAt: Date;
    }>;
    updateProfile(id: string, name?: string, phone?: string, gender?: string): Promise<{
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
        devicePermissions: Prisma.JsonValue;
        createdAt: Date;
    }>;
    setProxy(userId: string, email: string): Promise<{
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
        devicePermissions: Prisma.JsonValue;
        createdAt: Date;
    }>;
    removeProxy(userId: string): Promise<{
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
        devicePermissions: Prisma.JsonValue;
        createdAt: Date;
    }>;
    resetDevice(guardianId: string, childId: string): Promise<{
        message: string;
    }>;
    updateDevicePermissions(userId: string, permissions: Prisma.InputJsonObject): Promise<{
        success: boolean;
    }>;
    private hasPrismaCode;
}
