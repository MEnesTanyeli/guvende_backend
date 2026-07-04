import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/session.dto';
declare class ForgotPasswordDto {
    email: string;
}
declare class ResetPasswordDto {
    email: string;
    code: string;
    newPassword: string;
}
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    sendRegisterCode(email: string): Promise<{
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
    login(dto: LoginDto): Promise<{
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
    refresh(dto: RefreshTokenDto): Promise<{
        token: string;
        accessToken: string;
        refreshToken: string;
        accessTokenExpiresIn: number;
        refreshTokenExpiresAt: Date;
    }>;
    logout(user: any): Promise<{
        message: string;
    }>;
    logoutAll(user: any): Promise<{
        message: string;
    }>;
    forgotPassword(dto: ForgotPasswordDto): Promise<{
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
    resetPassword(dto: ResetPasswordDto): Promise<{
        message: string;
    }>;
    getMe(user: any): Promise<any>;
}
export {};
