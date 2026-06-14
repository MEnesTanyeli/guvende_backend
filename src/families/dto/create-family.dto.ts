import { IsNotEmpty, IsString, IsOptional } from 'class-validator';

export class CreateFamilyDto {
  @IsString()
  @IsNotEmpty({ message: 'Aile ismi boş bırakılamaz.' })
  name: string;

  @IsString()
  @IsOptional()
  type?: string;
}
