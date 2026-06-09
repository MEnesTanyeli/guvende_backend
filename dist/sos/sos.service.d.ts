import { PrismaService } from '../prisma/prisma.service';
import { TriggerSosDto } from './dto/trigger-sos.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { LocationsGateway } from '../locations/locations.gateway';
export declare class SosService {
    private prisma;
    private notificationsService;
    private locationsGateway;
    constructor(prisma: PrismaService, notificationsService: NotificationsService, locationsGateway: LocationsGateway);
    triggerSos(userId: string, dto: TriggerSosDto): Promise<{
        message: string;
        events: any[];
    }>;
}
