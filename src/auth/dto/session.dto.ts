import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class RefreshTokenDto {
  @IsString()
  @IsNotEmpty({ message: 'Refresh token boş bırakılamaz.' })
  @MaxLength(512, { message: 'Refresh token geçersiz.' })
  refreshToken: string;
}
