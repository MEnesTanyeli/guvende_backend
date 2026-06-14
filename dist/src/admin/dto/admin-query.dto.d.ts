export declare class AdminQueryDto {
    search?: string;
    page: number;
    limit: number;
}
export declare class UserQueryDto extends AdminQueryDto {
    role?: string;
    subscription?: string;
}
export declare class AlertQueryDto extends AdminQueryDto {
    status?: 'active' | 'resolved';
    type?: string;
}
