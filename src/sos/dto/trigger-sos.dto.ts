import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class TriggerSosDto {
  @IsNumber({}, { message: 'Enlem (latitude) geçerli bir sayı olmalıdır.' })
  @IsNotEmpty({ message: 'Enlem boş bırakılamaz.' })
  latitude: number;

  @IsNumber({}, { message: 'Boylam (longitude) geçerli bir sayı olmalıdır.' })
  @IsNotEmpty({ message: 'Boylam boş bırakılamaz.' })
  longitude: number;

  @IsString()
  @IsOptional()
  message?: string;
}
