import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class TriggerSosDto {
  @IsUUID('4', { message: 'eventId geçerli bir UUID v4 olmalıdır.' })
  eventId: string;

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
