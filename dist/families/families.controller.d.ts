import { FamiliesService } from './families.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { JoinFamilyDto } from './dto/join-family.dto';
export declare class FamiliesController {
    private familiesService;
    constructor(familiesService: FamiliesService);
    create(userId: string, dto: CreateFamilyDto): Promise<{
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        ownerId: string;
    }>;
    findAll(userId: string): Promise<({
        owner: {
            id: string;
            name: string;
            email: string;
        };
        _count: {
            members: number;
        };
    } & {
        id: string;
        name: string;
        createdAt: Date;
        updatedAt: Date;
        ownerId: string;
    })[]>;
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
    }>;
    updateMemberRole(userId: string, familyId: string, body: {
        targetUserId: string;
        memberType: string;
    }): Promise<{
        user: {
            id: string;
            name: string;
            email: string;
        };
    } & {
        id: string;
        createdAt: Date;
        userId: string;
        familyId: string;
        memberType: import(".prisma/client").$Enums.MemberType;
        permissions: string[];
    }>;
    findOne(userId: string, id: string): Promise<{
        owner: {
            id: string;
            name: string;
            email: string;
        };
        members: ({
            user: {
                id: string;
                name: string;
                email: string;
                phone: string | null;
            };
        } & {
            id: string;
            createdAt: Date;
            userId: string;
            familyId: string;
            memberType: import(".prisma/client").$Enums.MemberType;
            permissions: string[];
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
        ownerId: string;
    }>;
    invite(userId: string, id: string): Promise<{
        familyId: string;
        inviteCode: string;
        message: string;
    }>;
}
