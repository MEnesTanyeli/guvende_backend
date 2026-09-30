import { IsDateString, IsOptional, IsUUID, Matches } from 'class-validator';

export class GetDailyActivityQueryDto {
  @IsOptional()
  @IsUUID()
  memberId?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date YYYY-MM-DD formatinda olmalidir.',
  })
  @IsDateString({ strict: true })
  date?: string;
}
