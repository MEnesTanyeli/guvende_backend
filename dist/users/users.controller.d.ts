import { UsersService } from './users.service';
declare class UpdateProfileDto {
    name?: string;
    phone?: string;
}
export declare class UsersController {
    private usersService;
    constructor(usersService: UsersService);
    getProfile(userId: string): Promise<{
        id: string;
        email: string;
        name: string;
        phone: string | null;
        role: string;
        createdAt: Date;
    }>;
    updateProfile(userId: string, dto: UpdateProfileDto): Promise<{
        id: string;
        email: string;
        name: string;
        phone: string | null;
        role: string;
    }>;
}
export {};
