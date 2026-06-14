import { IsBoolean, IsDateString, IsIn, IsOptional } from 'class-validator';

export class UpdateAdminUserDto {
  @IsOptional()
  @IsIn(['guardian', 'child', 'elder', 'admin'])
  role?: string;

  @IsOptional()
  @IsBoolean()
  isPremium?: boolean;

  @IsOptional()
  @IsDateString()
  premiumExpiresAt?: string;
}
