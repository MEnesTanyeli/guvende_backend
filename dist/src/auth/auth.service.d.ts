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
        codeSent: boolean;
        message: string;
        expiresAt: Date;
        remainingSeconds: number;
    }>;
    register(dto: RegisterDto): Promise<{
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
        token: string;
        accessToken: string;
        refreshToken: string;
        accessTokenExpiresIn: number;
        refreshTokenExpiresAt: Date;
        message: string;
    }>;
    login(dto: LoginDto, requiredRole?: 'admin'): Promise<{
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
        token: string;
        accessToken: string;
        refreshToken: string;
        accessTokenExpiresIn: number;
        refreshTokenExpiresAt: Date;
        message: string;
    }>;
    adminLogin(dto: LoginDto): Promise<{
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
        token: string;
        accessToken: string;
        refreshToken: string;
        accessTokenExpiresIn: number;
        refreshTokenExpiresAt: Date;
        message: string;
    }>;
    private generateAccessToken;
    private createSession;
    refresh(refreshToken: string): Promise<{
        token: string;
        accessToken: string;
        refreshToken: string;
        accessTokenExpiresIn: number;
        refreshTokenExpiresAt: Date;
    }>;
    logout(sessionId: string): Promise<{
        message: string;
    }>;
    logoutAll(userId: string): Promise<{
        message: string;
    }>;
    private revokeAllSessions;
    private handleRefreshTokenReuse;
    private hashRefreshToken;
    forgotPassword(email: string): Promise<{
        message: string;
        codeSent?: undefined;
        expiresAt?: undefined;
        remainingSeconds?: undefined;
    } | {
        message: string;
        codeSent: boolean;
        expiresAt: Date;
        remainingSeconds: number;
    }>;
    resetPassword(dto: {
        email: string;
        code: string;
        newPassword: string;
    }): Promise<{
        message: string;
    }>;
    private remainingSeconds;
    private tooManyRequests;
}
