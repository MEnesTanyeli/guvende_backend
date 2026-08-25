import { IsEmail } from 'class-validator';

export class SetProxyDto {
  @IsEmail()
  email: string;
}
