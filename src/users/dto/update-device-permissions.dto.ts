import { IsObject } from 'class-validator';
import { Prisma } from '@prisma/client';

export class UpdateDevicePermissionsDto {
  @IsObject()
  permissions: Prisma.InputJsonObject;
}
