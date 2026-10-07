import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SubscriptionEntitlementService } from '../common/subscription-entitlement.service';
import { FamilyMembershipLockService } from '../common/family-membership-lock.service';

@Global()
@Module({
  providers: [
    PrismaService,
    SubscriptionEntitlementService,
    FamilyMembershipLockService,
  ],
  exports: [
    PrismaService,
    SubscriptionEntitlementService,
    FamilyMembershipLockService,
  ],
})
export class PrismaModule {}
