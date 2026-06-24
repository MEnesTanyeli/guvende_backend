import { IsBoolean, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export class RecordLocationDto {
  @IsNumber({}, { message: 'Enlem (latitude) geçerli bir sayı olmalıdır.' })
  latitude: number;

  @IsNumber({}, { message: 'Boylam (longitude) geçerli bir sayı olmalıdır.' })
  longitude: number;

  @IsNumber()
  @IsOptional()
  accuracy?: number;

  @IsNumber()
  @IsOptional()
  speed?: number;

  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  batteryLevel?: number;

  @IsBoolean()
  @IsOptional()
  isCharging?: boolean;

  @IsString()
  @IsOptional()
  connectionStatus?: string;

  @IsString()
  @IsOptional()
  recordedAt?: string;
}
