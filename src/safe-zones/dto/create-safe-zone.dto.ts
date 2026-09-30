import { IsNotEmpty, IsNumber, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateSafeZoneDto {
  @IsString()
  @MaxLength(100)
  @IsNotEmpty({ message: 'Bölge ismi boş bırakılamaz.' })
  name: string;

  @IsNumber({}, { message: 'Enlem (latitude) geçerli bir sayı olmalıdır.' })
  @Min(-90)
  @Max(90)
  latitude: number;

  @IsNumber({}, { message: 'Boylam (longitude) geçerli bir sayı olmalıdır.' })
  @Min(-180)
  @Max(180)
  longitude: number;

  @IsNumber({}, { message: 'Yarıçap (radius) geçerli bir sayı olmalıdır.' })
  @Min(10, { message: 'Yarıçap en az 10 metre olmalıdır.' })
  @Max(10000)
  radius: number;
}
