import {
  ArrayMaxSize,
  IsString,
  IsInt,
  IsArray,
  ValidateNested,
  IsOptional,
} from 'class-validator';
import { Type } from 'class-transformer';

export const MAX_APP_USAGE_BATCH_SIZE = 100;

export class AppUsageItemDto {
  @IsString()
  packageName!: string;

  @IsString()
  appName!: string;

  @IsInt()
  durationMin!: number;
}

export class SaveAppUsageDto {
  @IsArray()
  @ArrayMaxSize(MAX_APP_USAGE_BATCH_SIZE)
  @ValidateNested({ each: true })
  @Type(() => AppUsageItemDto)
  usages!: AppUsageItemDto[];

  @IsString()
  @IsOptional()
  recordedDate?: string;
}
