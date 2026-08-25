import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

export class CreateMedicationDto {
  @IsString()
  @IsNotEmpty()
  medicationName: string;

  @IsString()
  @IsNotEmpty()
  dosage: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^[0-2][0-9]:[0-5][0-9]$/, {
    message: 'Saat formatı HH:MM olmalıdır.',
  })
  time: string;

  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsString()
  @IsOptional()
  reminderType?: string;

  @IsString()
  @IsOptional()
  startDate?: string;

  @IsOptional()
  repeatDays?: number;
}
