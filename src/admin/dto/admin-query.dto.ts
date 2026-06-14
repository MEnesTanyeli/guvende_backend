import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class AdminQueryDto {
  @IsOptional()
  @IsString()
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;
}

export class UserQueryDto extends AdminQueryDto {
  @IsOptional()
  @IsIn(['guardian', 'child', 'elder', 'admin'])
  role?: string;

  @IsOptional()
  @IsIn(['all', 'premium', 'trial', 'expired'])
  subscription?: string;
}

export class AlertQueryDto extends AdminQueryDto {
  @IsOptional()
  @IsIn(['active', 'resolved'])
  status?: 'active' | 'resolved';

  @IsOptional()
  @IsString()
  type?: string;
}
