import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { SubscriptionEntitlementService } from '../common/subscription-entitlement.service';

@Global()
@Module({
  providers: [PrismaService, SubscriptionEntitlementService],
  exports: [PrismaService, SubscriptionEntitlementService],
})
export class PrismaModule {}
