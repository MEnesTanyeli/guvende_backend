import { PrismaService } from '../prisma/prisma.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { JoinFamilyDto } from './dto/join-family.dto';
export declare class FamiliesService {
    private prisma;
    constructor(prisma: PrismaService);
    create(userId: string, dto: CreateFamilyDto): Promise<{
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        ownerId: string;
    }>;
    findAll(userId: string): Promise<({
        _count: {
            members: number;
        };
        owner: {
            email: string;
            name: string;
            id: string;
        };
    } & {
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
        ownerId: string;
    })[]>;
    findOne(userId: string, familyId: string): Promise<{
        owner: {
            email: string;
            name: string;
            id: string;
        };
        members: ({
            user: {
                email: string;
                name: string;
                phone: string | null;
                id: string;
            };
        } & {
            id: string;
            createdAt: Date;
            familyId: string;
            memberType: import(".prisma/client").$Enums.MemberType;
            userId: string;
            permissions: string[];
        })[];
        safeZones: {
            name: string;
            id: string;
            createdAt: Date;
            familyId: string;
            latitude: number;
            longitude: number;
            radius: number;
            createdBy: string;
        }[];
    } & {
        name: string;
        id: string;
        createdAt: Date;
        updatedAt: Date;
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
        memberType: import(".prisma/client").$Enums.MemberType;
        userId: string;
        permissions: string[];
    }>;
}
