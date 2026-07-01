import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
export declare class AuthService {
    private prisma;
    private jwtService;
    private usersService;
    private mailService;
    constructor(prisma: PrismaService, jwtService: JwtService, usersService: UsersService, mailService: MailService);
    sendVerificationCode(email: string): Promise<{
        success: boolean;
        message: string;
    }>;
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
            devicePermissions: import("@prisma/client/runtime/library").JsonValue;
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
            devicePermissions: import("@prisma/client/runtime/library").JsonValue;
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
            devicePermissions: import("@prisma/client/runtime/library").JsonValue;
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
