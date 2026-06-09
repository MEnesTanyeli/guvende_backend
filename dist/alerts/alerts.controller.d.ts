import { AlertsService } from './alerts.service';
export declare class AlertsController {
    private alertsService;
    constructor(alertsService: AlertsService);
    findAll(userId: string, familyId: string): Promise<({
        user: {
            email: string;
            name: string;
            id: string;
        };
    } & {
        message: string;
        id: string;
        createdAt: Date;
        familyId: string;
        userId: string;
        type: import(".prisma/client").$Enums.AlertType;
        status: import(".prisma/client").$Enums.AlertStatus;
        title: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        resolvedAt: Date | null;
    })[]>;
    resolve(userId: string, id: string): Promise<{
        message: string;
        id: string;
        createdAt: Date;
        familyId: string;
        userId: string;
        type: import(".prisma/client").$Enums.AlertType;
        status: import(".prisma/client").$Enums.AlertStatus;
        title: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        resolvedAt: Date | null;
    }>;
}
