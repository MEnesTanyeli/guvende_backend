import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsIn,
  IsDateString,
  Max,
  Min,
} from 'class-validator';

export class RecordLocationDto {
  @IsNumber({}, { message: 'Enlem (latitude) geçerli bir sayı olmalıdır.' })
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber({}, { message: 'Boylam (longitude) geçerli bir sayı olmalıdır.' })
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsNumber()
  @Min(0)
  @IsOptional()
  accuracy?: number;

  @IsNumber()
  @Min(0)
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

  @IsIn(['online', 'offline'])
  @IsOptional()
  connectionStatus?: string;

  @IsDateString()
  @IsOptional()
  recordedAt?: string;

  @IsDateString()
  @IsOptional()
  measuredAt?: string;

  @IsString()
  @IsOptional()
  devicePointId?: string;

  @IsString()
  @IsOptional()
  filterVersion?: string;

  @IsIn(['unknown', 'moving', 'stationary'])
  @IsOptional()
  movementStatus?: 'unknown' | 'moving' | 'stationary';

  @IsIn(['live', 'deferred'])
  @IsOptional()
  deliveryMode?: 'live' | 'deferred';

  @IsIn(['offline', 'timeout', 'server_error', 'app_restart'])
  @IsOptional()
  deferredReason?: 'offline' | 'timeout' | 'server_error' | 'app_restart';

  @IsString()
  @IsOptional()
  insideZoneId?: string;

  @IsString()
  @IsOptional()
  insideZoneName?: string;
}
