import { IsIn, IsUUID } from 'class-validator';

export class AckAudibleWarningDto {
  @IsUUID()
  warningId: string;

  @IsIn(['received', 'muted', 'unanswered'])
  action: 'received' | 'muted' | 'unanswered';
}
