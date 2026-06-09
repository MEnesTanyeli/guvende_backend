import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';

export class CreateSafeZoneDto {
  @IsString()
  @IsNotEmpty({ message: 'Bölge ismi boş bırakılamaz.' })
  name: string;

  @IsNumber({}, { message: 'Enlem (latitude) geçerli bir sayı olmalıdır.' })
  latitude: number;

  @IsNumber({}, { message: 'Boylam (longitude) geçerli bir sayı olmalıdır.' })
  longitude: number;

  @IsNumber({}, { message: 'Yarıçap (radius) geçerli bir sayı olmalıdır.' })
  @Min(10, { message: 'Yarıçap en az 10 metre olmalıdır.' })
  radius: number;
}
