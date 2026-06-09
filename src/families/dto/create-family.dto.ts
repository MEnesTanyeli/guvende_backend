import { IsNotEmpty, IsString } from 'class-validator';

export class CreateFamilyDto {
  @IsString()
  @IsNotEmpty({ message: 'Aile ismi boş bırakılamaz.' })
  name: string;
}
