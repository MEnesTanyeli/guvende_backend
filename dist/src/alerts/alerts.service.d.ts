import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import { SubscriptionEntitlementService } from '../common/subscription-entitlement.service';
export declare class AlertsService {
    private prisma;
    private subscriptionEntitlement;
    constructor(prisma: PrismaService, subscriptionEntitlement: SubscriptionEntitlementService);
    findAll(userId: string, familyId: string): Promise<({
        user: {
            id: string;
            name: string;
        };
    } & {
        id: string;
        createdAt: Date;
        type: import(".prisma/client").$Enums.AlertType;
        message: string;
        userId: string;
        familyId: string;
        status: import(".prisma/client").$Enums.AlertStatus;
        title: string;
        metadata: Prisma.JsonValue | null;
        resolvedAt: Date | null;
        audibleWarningId: string | null;
    })[]>;
    resolve(userId: string, alertId: string): Promise<{
        id: string;
        createdAt: Date;
        type: import(".prisma/client").$Enums.AlertType;
        message: string;
        userId: string;
        familyId: string;
        status: import(".prisma/client").$Enums.AlertStatus;
        title: string;
        metadata: Prisma.JsonValue | null;
        resolvedAt: Date | null;
        audibleWarningId: string | null;
    }>;
    resolveAll(userId: string, familyId: string): Promise<Prisma.BatchPayload>;
}
