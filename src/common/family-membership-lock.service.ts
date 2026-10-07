import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class FamilyMembershipLockService {
  async lockUserMembership(
    tx: Prisma.TransactionClient,
    userId: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`family-membership-user:${userId}`}, 0))`;
  }

  async lockFamilyMembership(
    tx: Prisma.TransactionClient,
    familyId: string,
  ): Promise<void> {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`family-membership-family:${familyId}`}, 0))`;
  }
}
