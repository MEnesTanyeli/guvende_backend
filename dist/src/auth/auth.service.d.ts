import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';
export declare class AuthService {
    private prisma;
    private jwtService;
    private usersService;
    constructor(prisma: PrismaService, jwtService: JwtService, usersService: UsersService);
    register(dto: RegisterDto): Promise<{
        message: string;
        token: string;
        user: {
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
            devicePermissions: any;
            createdAt: Date;
        };
    }>;
    login(dto: LoginDto): Promise<{
        message: string;
        token: string;
        user: {
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
            devicePermissions: any;
            createdAt: Date;
        };
    }>;
    adminLogin(dto: LoginDto): Promise<{
        message: string;
        token: string;
        user: {
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
            devicePermissions: any;
            createdAt: Date;
        };
    }>;
    private generateToken;
    forgotPassword(email: string): Promise<{
        message: string;
    }>;
    resetPassword(dto: any): Promise<{
        message: string;
    }>;
}
