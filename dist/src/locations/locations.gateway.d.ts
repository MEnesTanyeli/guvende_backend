import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
export declare class LocationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private prisma;
    private jwtService;
    private readonly logger;
    private activeUsers;
    server: Server;
    constructor(prisma: PrismaService, jwtService: JwtService);
    private sendPushNotification;
    handleConnection(client: Socket): Promise<void>;
    handleDisconnect(client: Socket): Promise<void>;
    private updateUserConnectionStatus;
    private broadcastUserOffline;
    handleJoinFamily(data: {
        familyId: string;
    }, client: Socket): Promise<{
        status: string;
        message: string;
        room?: undefined;
    } | {
        status: string;
        room: string;
        message?: undefined;
    }>;
    handleLeaveFamily(data: {
        familyId: string;
    }, client: Socket): Promise<{
        status: string;
        message: string;
        room?: undefined;
    } | {
        status: string;
        room: string;
        message?: undefined;
    }>;
    handleSendDeviceLock(data: {
        targetUserId: string;
        lockState: boolean;
    }, client: Socket): Promise<{
        status: string;
        message: string;
    }>;
    sendLocationUpdate(familyId: string, locationData: any): void;
    sendAlertNotification(familyId: string, alertData: any): Promise<void>;
    sendEventToUser(userId: string, event: string, data: any): boolean;
}
