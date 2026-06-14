import { AlertsService } from './alerts.service';
export declare class AlertsController {
    private alertsService;
    constructor(alertsService: AlertsService);
    findAll(userId: string, familyId: string): Promise<({
        user: {
            id: string;
            email: string;
            name: string;
        };
    } & {
        id: string;
        createdAt: Date;
        message: string;
        familyId: string;
        userId: string;
        type: import(".prisma/client").$Enums.AlertType;
        title: string;
        status: import(".prisma/client").$Enums.AlertStatus;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        resolvedAt: Date | null;
    })[]>;
    resolve(userId: string, id: string): Promise<{
        id: string;
        createdAt: Date;
        message: string;
        familyId: string;
        userId: string;
        type: import(".prisma/client").$Enums.AlertType;
        title: string;
        status: import(".prisma/client").$Enums.AlertStatus;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        resolvedAt: Date | null;
    }>;
    resolveAll(userId: string, familyId: string): Promise<import(".prisma/client").Prisma.BatchPayload>;
}
