import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
export declare class LocationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private readonly logger;
    server: Server;
    handleConnection(client: Socket): void;
    handleDisconnect(client: Socket): void;
    handleJoinFamily(data: {
        familyId: string;
    }, client: Socket): {
        status: string;
        room: string;
    };
    handleLeaveFamily(data: {
        familyId: string;
    }, client: Socket): {
        status: string;
        room: string;
    };
    sendLocationUpdate(familyId: string, locationData: any): void;
    sendAlertNotification(familyId: string, alertData: any): void;
}
