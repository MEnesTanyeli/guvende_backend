import { PrismaService } from '../prisma/prisma.service';
export declare class AlertsService {
    private prisma;
    constructor(prisma: PrismaService);
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
    resolve(userId: string, alertId: string): Promise<{
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
