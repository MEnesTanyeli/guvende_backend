import { FamiliesService } from './families.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { JoinFamilyDto } from './dto/join-family.dto';
import { MuteNotificationsDto } from './dto/mute-notifications.dto';
import { UpdateOwnTrackingDto } from './dto/update-own-tracking.dto';
import { OfflineSosProvisioningDto } from '../offline-sos/dto/offline-sos-provisioning.dto';
export declare class FamiliesController {
    private familiesService;
    constructor(familiesService: FamiliesService);
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
    findOne(userId: string, id: string): Promise<{
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
    invite(userId: string, id: string): Promise<{
        familyId: string;
        inviteCode: string | null;
        message: string;
    }>;
    rotateInviteCode(userId: string, id: string): Promise<{
        inviteCode: string;
    }>;
    offlineSosProvisioning(userId: string, sessionId: string, familyId: string, dto: OfflineSosProvisioningDto): Promise<{
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
    leave(userId: string, id: string): Promise<{
        success: boolean;
        message: string;
    }>;
    removeMember(userId: string, id: string, targetUserId: string): Promise<{
        success: boolean;
        message: string;
    }>;
    deleteFamily(userId: string, id: string): Promise<{
        success: boolean;
        message: string;
    }>;
    muteNotifications(userId: string, familyId: string, dto: MuteNotificationsDto): Promise<{
        id: string;
        createdAt: Date;
        userId: string;
        familyId: string;
        memberType: import(".prisma/client").$Enums.MemberType;
        permissions: string[];
        muteNotifications: boolean;
        guardianTrackingEnabled: boolean;
    }>;
    updateOwnTracking(userId: string, familyId: string, dto: UpdateOwnTrackingDto): Promise<{
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
