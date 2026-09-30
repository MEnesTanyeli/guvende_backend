import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LocationsGateway } from '../locations/locations.gateway';
import { TriggerSosDto } from './dto/trigger-sos.dto';
export declare class SosService {
    private prisma;
    private notificationsService;
    private locationsGateway;
    constructor(prisma: PrismaService, notificationsService: NotificationsService, locationsGateway: LocationsGateway);
    triggerSos(userId: string, dto: TriggerSosDto): Promise<{
        message: string;
        events: {
            id: string;
            createdAt: Date;
            message: string | null;
            userId: string;
            latitude: number;
            longitude: number;
            familyId: string;
            eventId: string | null;
        }[];
        idempotent: boolean;
    }>;
}
