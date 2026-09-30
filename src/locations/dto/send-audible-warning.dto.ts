import { IsUUID } from 'class-validator';

export class SendAudibleWarningDto {
  @IsUUID('4')
  eventId: string;

  @IsUUID()
  targetUserId: string;
}
