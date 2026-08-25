import { IsBoolean } from 'class-validator';

export class MuteNotificationsDto {
  @IsBoolean()
  mute: boolean;
}
