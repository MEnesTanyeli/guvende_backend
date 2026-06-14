import { IsOptional, IsString, Matches } from 'class-validator';

export class UpdateMedicationDto {
  @IsString()
  @IsOptional()
  medicationName?: string;

  @IsString()
  @IsOptional()
  dosage?: string;

  @IsString()
  @IsOptional()
  @Matches(/^[0-2][0-9]:[0-5][0-9]$/, { message: 'Saat formatı HH:MM olmalıdır.' })
  time?: string;

  @IsString()
  @IsOptional()
  reminderType?: string;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsOptional()
  repeatDays?: number;
}
