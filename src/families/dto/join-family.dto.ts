import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { MemberType } from '@prisma/client';

export class JoinFamilyDto {
  @IsString()
  @IsNotEmpty({ message: 'Aile kodu / kimliği boş bırakılamaz.' })
  familyId: string;

  @IsEnum(MemberType, {
    message: 'Geçersiz üye tipi (guardian, child, elder).',
  })
  @IsOptional()
  memberType?: MemberType;
}
