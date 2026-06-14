import { IsEmail, IsNotEmpty, IsOptional, IsString, MinLength, IsIn } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Geçerli bir e-posta adresi giriniz.' })
  @IsNotEmpty({ message: 'E-posta alanı boş bırakılamaz.' })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Şifre alanı boş bırakılamaz.' })
  @MinLength(6, { message: 'Şifre en az 6 karakter olmalıdır.' })
  password: string;

  @IsString()
  @IsNotEmpty({ message: 'İsim alanı boş bırakılamaz.' })
  name: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsString()
  @IsOptional()
  @IsIn(['guardian', 'child', 'elder'], { message: 'Geçersiz hesap türü seçildi.' })
  role?: string;

  @IsString()
  @IsOptional()
  @IsIn(['male', 'female', 'other'], { message: 'Geçersiz cinsiyet seçildi.' })
  gender?: string;
}
