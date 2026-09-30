import { SosService } from './sos.service';
import { TriggerSosDto } from './dto/trigger-sos.dto';
export declare class SosController {
    private sosService;
    constructor(sosService: SosService);
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
