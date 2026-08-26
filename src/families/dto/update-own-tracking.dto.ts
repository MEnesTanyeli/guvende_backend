import { IsBoolean } from 'class-validator';

export class UpdateOwnTrackingDto {
  @IsBoolean()
  enabled: boolean;
}
