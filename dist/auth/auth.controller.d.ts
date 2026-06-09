import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    register(dto: RegisterDto): Promise<{
        message: string;
        token: string;
        user: {
            id: string;
            name: string;
            email: string;
            phone: string | null;
            role: string;
        };
    }>;
    login(dto: LoginDto): Promise<{
        message: string;
        token: string;
        user: {
            id: string;
            name: string;
            email: string;
            phone: string | null;
            role: string;
        };
    }>;
    getMe(user: any): Promise<any>;
}
