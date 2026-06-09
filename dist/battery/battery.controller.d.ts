import { BatteryService } from './battery.service';
import { UpdateBatteryDto } from './dto/update-battery.dto';
export declare class BatteryController {
    private batteryService;
    constructor(batteryService: BatteryService);
    updateBattery(userId: string, dto: UpdateBatteryDto): Promise<{
        message: string;
        batteryLevel: number;
        isCharging: boolean;
    }>;
}
