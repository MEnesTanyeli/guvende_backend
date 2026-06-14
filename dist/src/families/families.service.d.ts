import { PrismaService } from '../prisma/prisma.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { JoinFamilyDto } from './dto/join-family.dto';
import { NotificationsService } from '../notifications/notifications.service';
export declare class FamiliesService {
    private prisma;
    private notificationsService;
    constructor(prisma: PrismaService, notificationsService: NotificationsService);
    create(userId: string, dto: CreateFamilyDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        ownerId: string;
    }>;
    findAll(userId: string): Promise<({
        _count: {
            members: number;
        };
        owner: {
            id: string;
            email: string;
            name: string;
        };
        members: {
            memberType: import(".prisma/client").$Enums.MemberType;
            muteNotifications: boolean;
        }[];
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        type: string;
        ownerId: string;
    })[]>;
    findOne(userId: string, familyId: string): Promise<{
        owner: {
            id: string;
            email: string;
            name: string;
        };
        members: ({
            user: {
                id: string;
                email: string;
                name: string;
                phone: string | null;
                gender: string | null;
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
        type: string;
        ownerId: string;
    }>;
    invite(userId: string, familyId: string): Promise<{
        familyId: string;
        inviteCode: string;
        message: string;
    }>;
    join(userId: string, dto: JoinFamilyDto): Promise<{
        family: {
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
    }>;
    updateMemberRole(userId: string, familyId: string, targetUserId: string, newRole: string): Promise<{
        user: {
            id: string;
            email: string;
            name: string;
            gender: string | null;
        };
    } & {
        id: string;
        createdAt: Date;
        familyId: string;
        userId: string;
        memberType: import(".prisma/client").$Enums.MemberType;
        permissions: string[];
        muteNotifications: boolean;
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
        familyId: string;
        userId: string;
        memberType: import(".prisma/client").$Enums.MemberType;
        permissions: string[];
        muteNotifications: boolean;
    }>;
}
