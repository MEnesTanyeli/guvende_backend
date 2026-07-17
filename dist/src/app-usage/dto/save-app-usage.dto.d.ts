export declare class AppUsageItemDto {
    packageName: string;
    appName: string;
    durationMin: number;
}
export declare class SaveAppUsageDto {
    usages: AppUsageItemDto[];
    recordedDate?: string;
}
