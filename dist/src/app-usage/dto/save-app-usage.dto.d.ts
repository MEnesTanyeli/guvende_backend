export declare const MAX_APP_USAGE_BATCH_SIZE = 100;
export declare class AppUsageItemDto {
    packageName: string;
    appName: string;
    durationMin: number;
}
export declare class SaveAppUsageDto {
    usages: AppUsageItemDto[];
    recordedDate?: string;
}
