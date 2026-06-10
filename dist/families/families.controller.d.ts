import { FamiliesService } from './families.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { JoinFamilyDto } from './dto/join-family.dto';
export declare class FamiliesController {
    private familiesService;
    constructor(familiesService: FamiliesService);
    create(userId: string, dto: CreateFamilyDto): Promise<{
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
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
    } & {
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        ownerId: string;
    })[]>;
    join(userId: string, dto: JoinFamilyDto): Promise<{
        family: {
            name: string;
        };
    } & {
        id: string;
        familyId: string;
        userId: string;
        memberType: import(".prisma/client").$Enums.MemberType;
        permissions: string[];
        createdAt: Date;
    }>;
    updateMemberRole(userId: string, familyId: string, body: {
        targetUserId: string;
        memberType: string;
    }): Promise<{
        user: {
            id: string;
            email: string;
            name: string;
        };
    } & {
        id: string;
        familyId: string;
        userId: string;
        memberType: import(".prisma/client").$Enums.MemberType;
        permissions: string[];
        createdAt: Date;
    }>;
    findOne(userId: string, id: string): Promise<{
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
            };
        } & {
            id: string;
            familyId: string;
            userId: string;
            memberType: import(".prisma/client").$Enums.MemberType;
            permissions: string[];
            createdAt: Date;
        })[];
        safeZones: {
            id: string;
            familyId: string;
            createdAt: Date;
            name: string;
            latitude: number;
            longitude: number;
            radius: number;
            createdBy: string;
        }[];
    } & {
        id: string;
        createdAt: Date;
        name: string;
        updatedAt: Date;
        ownerId: string;
    }>;
    invite(userId: string, id: string): Promise<{
        familyId: string;
        inviteCode: string;
        message: string;
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
}
