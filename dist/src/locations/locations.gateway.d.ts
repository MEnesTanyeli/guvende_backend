import { OnGatewayConnection, OnGatewayDisconnect } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { SubscriptionEntitlementService } from '../common/subscription-entitlement.service';
interface SocketAuthData {
    userId?: string;
    sessionId?: string;
    authExpiryTimer?: NodeJS.Timeout;
}
type AuthenticatedSocket = Socket<Record<string, unknown>, Record<string, unknown>, Record<string, unknown>, SocketAuthData>;
export declare class LocationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    private prisma;
    private jwtService;
    private subscriptionEntitlement;
    private readonly logger;
    private activeUsers;
    server: Server;
    constructor(prisma: PrismaService, jwtService: JwtService, subscriptionEntitlement: SubscriptionEntitlementService);
    disconnectUser(userId: string): void;
    disconnectSessions(userId: string, sessionIds: readonly string[]): void;
    private disconnectSocket;
    clearFamilyRoom(familyId: string): void;
    isUserConnected(userId: string): boolean;
    revokeFamilyAccess(userId: string, familyId: string): Promise<void>;
    private sendPushNotification;
    sendSilentPushNotification(userIds: string[], data: Record<string, unknown>): Promise<unknown>;
    handleConnection(client: AuthenticatedSocket): Promise<void>;
    handleDisconnect(client: AuthenticatedSocket): Promise<void>;
    private updateUserConnectionStatus;
    private broadcastUserOffline;
    handleJoinFamily(data: {
        familyId: string;
    }, client: AuthenticatedSocket): Promise<{
        status: string;
        message: string;
    } | {
        status: string;
        message?: undefined;
    }>;
    handleJoinAdminControlRoom(client: AuthenticatedSocket): Promise<{
        status: string;
        message: string;
    } | {
        status: string;
        message?: undefined;
    }>;
    handleLeaveFamily(data: {
        familyId: string;
    }, client: AuthenticatedSocket): {
        status: string;
        message: string;
    } | {
        status: string;
        message?: undefined;
    };
    handleSendDeviceLock(): {
        status: string;
        message: string;
    };
    sendLocationUpdate(familyId: string, locationData: Record<string, unknown>, subscriptionExempt?: boolean): Promise<void>;
    sendAlertNotification(familyId: string, alertData: Record<string, unknown> & {
        senderId?: string;
        userId?: string;
        data?: Record<string, unknown> & {
            userId?: string;
        };
        title?: string;
    }): Promise<void>;
    handleVideoCallRequestDisabled(): {
        status: string;
        message: string;
    };
    handleVideoCallResponseDisabled(): {
        status: string;
        message: string;
    };
    handleWebRTCSignalDisabled(): {
        status: string;
        message: string;
    };
    sendEventToUser(userId: string, event: string, data: any): boolean;
}
export {};
