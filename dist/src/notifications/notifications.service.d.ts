import { PrismaService } from '../prisma/prisma.service';
import { LocationsGateway } from '../locations/locations.gateway';
import { AlertType, Prisma } from '@prisma/client';
type AlertDelivery = 'family' | 'socket' | 'none';
interface RaiseFamilyAlertInput {
    familyId: string;
    userId: string;
    type: AlertType;
    title: string;
    message: string;
    metadata?: Prisma.InputJsonValue;
    notificationData?: Record<string, unknown>;
    delivery?: AlertDelivery;
    dedupeActive?: boolean;
    dedupeWindowMs?: number;
}
interface RaiseUserAlertForFamiliesInput extends Omit<RaiseFamilyAlertInput, 'familyId'> {
    familyIds: string[];
    dedupeActiveByUser?: boolean;
}
export declare class NotificationsService {
    private prisma;
    private locationsGateway;
    private readonly logger;
    constructor(prisma: PrismaService, locationsGateway: LocationsGateway);
    raiseFamilyAlert(input: RaiseFamilyAlertInput): Promise<{
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
    raiseUserAlertForFamilies(input: RaiseUserAlertForFamiliesInput): Promise<{
        id: string;
    }[]>;
    resolveActiveAlerts(userId: string, types: AlertType | AlertType[]): Promise<Prisma.BatchPayload>;
    sendOneSignalNotification(userIds: string[], title: string, message: string, data?: Record<string, unknown>): Promise<unknown>;
    sendNotification(userId: string, title: string, message: string, data?: Record<string, unknown>): Promise<{
        success: boolean;
        userId: string;
        title: string;
        message: string;
    }>;
    sendFamilyNotification(familyId: string, senderId: string, title: string, message: string, data?: Record<string, unknown>): Promise<{
        success: boolean;
        recipientsCount: number;
    }>;
}
export {};
