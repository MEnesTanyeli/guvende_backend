export declare class RecordLocationDto {
    latitude: number;
    longitude: number;
    accuracy?: number;
    speed?: number;
    batteryLevel?: number;
    isCharging?: boolean;
    connectionStatus?: string;
    recordedAt?: string;
    measuredAt?: string;
    devicePointId?: string;
    filterVersion?: string;
    movementStatus?: 'unknown' | 'moving' | 'stationary';
    deliveryMode?: 'live' | 'deferred';
    deferredReason?: 'offline' | 'timeout' | 'server_error' | 'app_restart';
    insideZoneId?: string;
    insideZoneName?: string;
}
