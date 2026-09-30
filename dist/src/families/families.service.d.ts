import { PrismaService } from '../prisma/prisma.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { JoinFamilyDto } from './dto/join-family.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { LocationsGateway } from '../locations/locations.gateway';
import { OfflineSosService } from '../offline-sos/offline-sos.service';
import { SubscriptionEntitlementService } from '../common/subscription-entitlement.service';
export declare class FamiliesService {
    private prisma;
    private notificationsService;
    private locationsGateway;
    private offlineSosService;
    private subscriptionEntitlement;
    private readonly inviteCodeAlphabet;
    constructor(prisma: PrismaService, notificationsService: NotificationsService, locationsGateway: LocationsGateway, offlineSosService: OfflineSosService, subscriptionEntitlement: SubscriptionEntitlementService);
    private createInviteCode;
    private createSosEncryptionKey;
    private lockUserMembership;
    private lockFamilyMembership;
    private dissolveOwnedFamily;
    private generateUniqueInviteCode;
    private isInviteCodeUniqueCollision;
    private retryInviteCodeWrite;
    create(userId: string, dto: CreateFamilyDto): Promise<{
        id: string;
        name: string;
        type: string;
        ownerId: string;
        createdAt: Date;
        updatedAt: Date;
        inviteCode: string | null;
    }>;
    findAll(userId: string): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        _count: {
            members: number;
        };
        type: string;
        ownerId: string;
        owner: {
            id: string;
            name: string;
        };
        members: {
            memberType: import(".prisma/client").$Enums.MemberType;
            muteNotifications: boolean;
            guardianTrackingEnabled: boolean;
        }[];
    }[]>;
    offlineSosProvisioning(userId: string, sessionId: string, familyId: string, deviceWrappingPublicKey?: string): Promise<{
        protocolVersion: number;
        familyBinding: string;
        senderBinding: string;
        keyVersion: number;
        familyPublicEncryptionKey: string;
        emergencyContacts: {
            displayName: string;
            phone: string;
        }[];
        issuedAt: string;
        refreshAfter: string;
    } | {
        decryptionKeys: {
            keyVersion: number;
            status: string;
            retiredAt: string | null;
            wrappedPrivateKey: string;
        }[];
        protocolVersion: number;
        familyBinding: string;
        senderBinding: string;
        keyVersion: number;
        familyPublicEncryptionKey: string;
        emergencyContacts: {
            displayName: string;
            phone: string;
        }[];
        issuedAt: string;
        refreshAfter: string;
    }>;
    findOne(userId: string, familyId: string): Promise<{
        members: {
            guardianTrackingEnabled?: boolean | undefined;
            muteNotifications?: boolean | undefined;
            id: string;
            userId: string;
            memberType: import(".prisma/client").$Enums.MemberType;
            user: {
                id: string;
                name: string;
            };
        }[];
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        ownerId: string;
        owner: {
            id: string;
            name: string;
        };
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
    }>;
    invite(userId: string, familyId: string): Promise<{
        familyId: string;
        inviteCode: string | null;
        message: string;
    }>;
    rotateInviteCode(userId: string, familyId: string): Promise<{
        inviteCode: string;
    }>;
    join(userId: string, dto: JoinFamilyDto): Promise<{
        family: {
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
    }>;
    leave(userId: string, familyId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    removeMember(userId: string, familyId: string, targetUserId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    deleteFamily(userId: string, familyId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    muteNotifications(userId: string, familyId: string, mute: boolean): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        familyId: string;
        memberType: import(".prisma/client").$Enums.MemberType;
        permissions: string[];
        muteNotifications: boolean;
        guardianTrackingEnabled: boolean;
    }>;
    updateOwnTracking(userId: string, familyId: string, enabled: boolean): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        familyId: string;
        memberType: import(".prisma/client").$Enums.MemberType;
        permissions: string[];
        muteNotifications: boolean;
        guardianTrackingEnabled: boolean;
    }>;
}
