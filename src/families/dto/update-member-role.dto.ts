import { MemberType } from '@prisma/client';
import { IsEnum, IsString } from 'class-validator';

export class UpdateMemberRoleDto {
  @IsString()
  targetUserId: string;

  @IsEnum(MemberType)
  memberType: MemberType;
}
