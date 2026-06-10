import { PrismaService } from '../prisma/prisma.service';
export declare class UsersService {
    private prisma;
    constructor(prisma: PrismaService);
    findOne(id: string): Promise<{
        id: string;
        email: string;
        name: string;
        phone: string | null;
        role: string;
        createdAt: Date;
    }>;
    updateProfile(id: string, name?: string, phone?: string): Promise<{
        id: string;
        email: string;
        name: string;
        phone: string | null;
        role: string;
    }>;
}
