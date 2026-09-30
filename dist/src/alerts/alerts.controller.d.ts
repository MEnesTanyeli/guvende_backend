import { AlertsService } from './alerts.service';
export declare class AlertsController {
    private alertsService;
    constructor(alertsService: AlertsService);
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
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        resolvedAt: Date | null;
        audibleWarningId: string | null;
    })[]>;
    resolve(userId: string, id: string): Promise<{
        id: string;
        createdAt: Date;
        type: import(".prisma/client").$Enums.AlertType;
        message: string;
        userId: string;
        familyId: string;
        status: import(".prisma/client").$Enums.AlertStatus;
        title: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        resolvedAt: Date | null;
        audibleWarningId: string | null;
    }>;
    resolveAll(userId: string, familyId: string): Promise<import(".prisma/client").Prisma.BatchPayload>;
}
