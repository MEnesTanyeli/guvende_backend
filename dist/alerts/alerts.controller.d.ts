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
        familyId: string;
        message: string;
        userId: string;
        type: import(".prisma/client").$Enums.AlertType;
        status: import(".prisma/client").$Enums.AlertStatus;
        title: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        resolvedAt: Date | null;
    })[]>;
    resolve(userId: string, id: string): Promise<{
        id: string;
        createdAt: Date;
        familyId: string;
        message: string;
        userId: string;
        type: import(".prisma/client").$Enums.AlertType;
        status: import(".prisma/client").$Enums.AlertStatus;
        title: string;
        metadata: import("@prisma/client/runtime/library").JsonValue | null;
        resolvedAt: Date | null;
    }>;
}
