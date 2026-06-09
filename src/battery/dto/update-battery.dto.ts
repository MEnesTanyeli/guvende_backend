import { IsBoolean, IsNotEmpty, IsNumber, Max, Min } from 'class-validator';

export class UpdateBatteryDto {
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsNotEmpty({ message: 'Batarya seviyesi boş bırakılamaz.' })
  batteryLevel: number;

  @IsBoolean()
  @IsNotEmpty({ message: 'Şarj durumu boş bırakılamaz.' })
  isCharging: boolean;
}
