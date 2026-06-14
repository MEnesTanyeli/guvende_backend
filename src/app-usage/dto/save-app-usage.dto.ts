import { IsString, IsInt, IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

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
  @ValidateNested({ each: true })
  @Type(() => AppUsageItemDto)
  usages!: AppUsageItemDto[];
}
