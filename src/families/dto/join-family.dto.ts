import { IsNotEmpty, IsString } from 'class-validator';

export class JoinFamilyDto {
  @IsString()
  @IsNotEmpty({ message: 'Aile davet kodu boş bırakılamaz.' })
  inviteCode: string;
}
