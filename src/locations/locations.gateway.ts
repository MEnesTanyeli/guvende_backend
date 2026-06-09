import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class LocationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('LocationsGateway');

  @WebSocketServer()
  server: Server;

  handleConnection(client: Socket) {
    this.logger.log(`Soket bağlantısı kuruldu: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Soket bağlantısı kesildi: ${client.id}`);
  }

  @SubscribeMessage('joinFamily')
  handleJoinFamily(@MessageBody() data: { familyId: string }, @ConnectedSocket() client: Socket) {
    const room = `family_${data.familyId}`;
    client.join(room);
    this.logger.log(`İstemci (${client.id}), odaya katıldı: ${room}`);
    return { status: 'success', room };
  }

  @SubscribeMessage('leaveFamily')
  handleLeaveFamily(@MessageBody() data: { familyId: string }, @ConnectedSocket() client: Socket) {
    const room = `family_${data.familyId}`;
    client.leave(room);
    this.logger.log(`İstemci (${client.id}), odadan ayrıldı: ${room}`);
    return { status: 'success', room };
  }

  // Aile odasına konum güncellemesini yayınlar
  sendLocationUpdate(familyId: string, locationData: any) {
    const room = `family_${familyId}`;
    this.server.to(room).emit('location_update', locationData);
    this.logger.log(`Odaya (${room}) yeni konum yayını yapıldı: ${JSON.stringify(locationData.userId)}`);
  }
}
