import { PrismaService } from '../prisma/prisma.service';
export declare class AlertsService {
    private prisma;
    constructor(prisma: PrismaService);
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
    resolve(userId: string, alertId: string): Promise<{
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
