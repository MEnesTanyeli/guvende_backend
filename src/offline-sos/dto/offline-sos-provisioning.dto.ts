import { IsOptional, IsString, MaxLength, Matches } from 'class-validator';

export class OfflineSosProvisioningDto {
  @IsOptional()
  @IsString()
  @MaxLength(1024)
  @Matches(/^[A-Za-z0-9_-]+$/)
  deviceWrappingPublicKey?: string;
}
