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
import { PrismaService } from '../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import * as https from 'https';

@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGINS || '')
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean),
  },
})
export class LocationsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger('LocationsGateway');
  private activeUsers = new Map<string, Set<string>>();

  @WebSocketServer()
  server: Server;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  isUserConnected(userId: string): boolean {
    const userSockets = this.activeUsers.get(userId);
    return !!(userSockets && userSockets.size > 0);
  }

  private async sendPushNotification(
    userIds: string[],
    title: string,
    message: string,
    data?: any,
  ) {
    const appId = process.env.ONESIGNAL_APP_ID;
    const apiKey = process.env.ONESIGNAL_REST_API_KEY;

    if (!appId || !apiKey) {
      this.logger.warn(
        'OneSignal App ID veya REST API Key eksik. Push bildirim gönderilemedi.',
      );
      return;
    }

    if (userIds.length === 0) {
      return;
    }

    const payload = {
      app_id: appId,
      include_external_user_ids: userIds,
      headings: { tr: title, en: title },
      contents: { tr: message, en: message },
      data: data || {},
      priority: 10,
    };

    const payloadStr = JSON.stringify(payload);

    const options = {
      hostname: 'onesignal.com',
      port: 443,
      path: '/api/v1/notifications',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Basic ${apiKey}`,
        'Content-Length': Buffer.byteLength(payloadStr),
      },
    };

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          this.logger.log(
            `LocationsGateway OneSignal Push Gönderim Sonucu: ${res.statusCode} | Gövde: ${responseBody}`,
          );
          resolve({ statusCode: res.statusCode, body: responseBody });
        });
      });

      req.on('error', (err) => {
        this.logger.error(
          `LocationsGateway OneSignal Push Gönderimi Hata Aldı: ${err.message}`,
        );
        resolve({ error: err.message });
      });

      req.write(payloadStr);
      req.end();
    });
  }

  async sendSilentPushNotification(userIds: string[], data: any) {
    const appId = process.env.ONESIGNAL_APP_ID;
    const apiKey = process.env.ONESIGNAL_REST_API_KEY;

    if (!appId || !apiKey) {
      this.logger.warn(
        'OneSignal App ID veya REST API Key eksik. Silent push bildirim gönderilemedi.',
      );
      return;
    }

    if (userIds.length === 0) {
      return;
    }

    const payload = {
      app_id: appId,
      include_external_user_ids: userIds,
      data: data || {},
      content_available: true, // silent notification wake up
      priority: 10,
    };

    const payloadStr = JSON.stringify(payload);

    const options = {
      hostname: 'onesignal.com',
      port: 443,
      path: '/api/v1/notifications',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Basic ${apiKey}`,
        'Content-Length': Buffer.byteLength(payloadStr),
      },
    };

    return new Promise((resolve) => {
      const req = https.request(options, (res) => {
        let responseBody = '';
        res.on('data', (chunk) => {
          responseBody += chunk;
        });
        res.on('end', () => {
          this.logger.log(
            `LocationsGateway Silent OneSignal Push Gönderim Sonucu: ${res.statusCode} | Gövde: ${responseBody}`,
          );
          resolve({ statusCode: res.statusCode, body: responseBody });
        });
      });

      req.on('error', (err) => {
        this.logger.error(
          `LocationsGateway Silent OneSignal Push Gönderimi Hata Aldı: ${err.message}`,
        );
        resolve({ error: err.message });
      });

      req.write(payloadStr);
      req.end();
    });
  }

  async handleConnection(client: Socket) {
    try {
      const authHeader =
        client.handshake.auth?.token || client.handshake.headers?.authorization;
      let token = '';

      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      } else {
        const queryToken = client.handshake.query.token as string;
        if (queryToken) {
          token = queryToken;
        }
      }

      if (!token) {
        this.logger.warn(
          `Soket bağlantısı reddedildi: Token bulunamadı. Cihaz: ${client.id}`,
        );
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(token);
      const userId = payload.sub;

      if (!userId || !payload.sid || payload.typ !== 'access') {
        this.logger.warn(
          `Soket bağlantısı reddedildi: Geçersiz token payloadı. Cihaz: ${client.id}`,
        );
        client.disconnect(true);
        return;
      }

      const session = await this.prisma.session.findFirst({
        where: {
          id: payload.sid,
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!session) {
        this.logger.warn(
          `Soket bağlantısı reddedildi: Oturum geçersiz. Cihaz: ${client.id}`,
        );
        client.disconnect(true);
        return;
      }

      client.data.userId = userId;
      client.data.sessionId = session.id;

      // Oturum sonradan kapatılırsa bir sonraki socket mesajında bağlantıyı kes.
      client.use(async (_packet, next) => {
        const activeSession = await this.prisma.session.findFirst({
          where: {
            id: client.data.sessionId,
            userId: client.data.userId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        });
        if (!activeSession) {
          client.disconnect(true);
          next(new Error('Oturum kapatılmış veya süresi dolmuş.'));
          return;
        }
        next();
      });

      // Token süresi dolunca açık WebSocket bağlantısını da kapat.
      if (payload.exp) {
        const remainingMs = Math.max(0, payload.exp * 1000 - Date.now());
        client.data.authExpiryTimer = setTimeout(
          () => client.disconnect(true),
          remainingMs,
        );
      }
      let userSockets = this.activeUsers.get(userId);
      if (!userSockets) {
        userSockets = new Set();
        this.activeUsers.set(userId, userSockets);
      }
      userSockets.add(client.id);
      this.logger.log(
        `Kullanıcı (${userId}) soket bağlantısı kurdu: ${client.id}`,
      );

      // Veritabanındaki bağlantı durumunu çevrimiçi yap
      await this.updateUserConnectionStatus(userId, 'online');
    } catch (err) {
      this.logger.error(
        `Soket bağlantısı doğrulanamadı: ${err.message}. Cihaz: ${client.id}`,
      );
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    if (client.data.authExpiryTimer) {
      clearTimeout(client.data.authExpiryTimer);
    }
    const userId = client.data.userId;
    if (userId) {
      const userSockets = this.activeUsers.get(userId);
      if (userSockets) {
        userSockets.delete(client.id);
        this.logger.log(
          `Kullanıcı (${userId}) bir soket bağlantısını kapattı: ${client.id}`,
        );
        if (userSockets.size === 0) {
          this.activeUsers.delete(userId);
          this.logger.log(
            `Kullanıcı (${userId}) tamamen ayrıldı. Veritabanı çevrimdışı yapılıyor...`,
          );

          // Veritabanındaki bağlantı durumunu çevrimdışı yap
          await this.updateUserConnectionStatus(userId, 'offline');

          // Tüm aile gruplarına bu kullanıcının çevrimdışı olduğunu bildir
          await this.broadcastUserOffline(userId);
        }
      }
    } else {
      this.logger.log(
        `Soket bağlantısı kesildi (anonim/yetkisiz): ${client.id}`,
      );
    }
  }

  private async updateUserConnectionStatus(
    userId: string,
    status: 'online' | 'offline',
  ) {
    try {
      const lastLoc = await this.prisma.location.findFirst({
        where: { userId },
        orderBy: { recordedAt: 'desc' },
      });

      if (lastLoc) {
        await this.prisma.location.update({
          where: { id: lastLoc.id },
          data: { connectionStatus: status },
        });
        this.logger.log(
          `Kullanıcının (${userId}) son konum bağlantı durumu güncellendi: ${status}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Bağlantı durumu güncellenirken hata oluştu (userId: ${userId}):`,
        err,
      );
    }
  }

  private async broadcastUserOffline(userId: string) {
    try {
      const memberships = await this.prisma.familyMember.findMany({
        where: { userId },
        select: { familyId: true },
      });

      for (const membership of memberships) {
        const room = `family_${membership.familyId}`;
        this.server.to(room).emit('user_offline', { userId });
        this.logger.log(
          `Odaya (${room}) kullanıcının çevrimdışı olduğu bildirildi: ${userId}`,
        );
      }
    } catch (err) {
      this.logger.error(
        `Çevrimdışı yayını yapılırken hata oluştu (userId: ${userId}):`,
        err,
      );
    }
  }

  @SubscribeMessage('joinFamily')
  async handleJoinFamily(
    @MessageBody() data: { familyId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId;
    if (!userId) {
      this.logger.warn(
        `Odaya katılım reddedildi: Kullanıcı kimliği doğrulanmamış.`,
      );
      return { status: 'error', message: 'Yetkisiz erişim.' };
    }

    // Kullanıcının bu aile grubunda üye olduğunu doğrula
    const isMember = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId: data.familyId,
          userId: userId,
        },
      },
    });

    if (!isMember) {
      this.logger.warn(
        `Kullanıcı (${userId}) üye olmadığı odaya katılmaya çalıştı: family_${data.familyId}`,
      );
      return {
        status: 'error',
        message: 'Bu aile odasına katılma yetkiniz yok.',
      };
    }

    const room = `family_${data.familyId}`;
    client.join(room);
    this.logger.log(`İstemci (${client.id}), odaya katıldı: ${room}`);
    return { status: 'success', room };
  }

  @SubscribeMessage('joinAdminControlRoom')
  async handleJoinAdminControlRoom(
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId;
    if (!userId) {
      return { status: 'error', message: 'Yetkisiz erişim.' };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true }
    });

    if (!user || user.role !== 'admin') {
      return { status: 'error', message: 'Sadece yöneticiler katılabilir.' };
    }

    client.join('admin_control_room');
    this.logger.log(`İstemci (${client.id}), admin_control_room odasına katıldı.`);
    return { status: 'success' };
  }

  @SubscribeMessage('leaveFamily')
  async handleLeaveFamily(
    @MessageBody() data: { familyId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const userId = client.data.userId;
    if (!userId) {
      return { status: 'error', message: 'Yetkisiz erişim' };
    }

    const room = `family_${data.familyId}`;
    client.leave(room);
    this.logger.log(
      `İstemci (${client.id} - ${userId}), odadan ayrıldı: ${room}`,
    );
    return { status: 'success', room };
  }

  @SubscribeMessage('sendDeviceLock')
  async handleSendDeviceLock(
    @MessageBody() data: { targetUserId: string; lockState: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    return {
      status: 'error',
      message: 'Cihaz kilitleme özelliği devre dışı bırakılmıştır.',
    };
  }

  // Aile odasına konum güncellemesini yayınlar
  sendLocationUpdate(familyId: string, locationData: any) {
    const room = `family_${familyId}`;
    this.server.to(room).emit('location_update', locationData);
    this.server.to('admin_control_room').emit('location_update', locationData);
    this.logger.log(
      `Odaya (${room}) ve admin_control_room odasına yeni konum yayını yapıldı: ${JSON.stringify(locationData.userId)}`,
    );
  }

  // Aile odasındaki sadece velilere (guardian) alarm bildirimini gönderir
  async sendAlertNotification(familyId: string, alertData: any) {
    try {
      const senderId =
        alertData.senderId || alertData.userId || alertData.data?.userId;

      const guardians = await this.prisma.familyMember.findMany({
        where: {
          familyId,
          memberType: 'guardian',
        },
        select: {
          userId: true,
        },
      });

      let targetGuardians = guardians;
      if (senderId) {
        targetGuardians = guardians.filter((g) => g.userId !== senderId);
      }

      for (const guardian of targetGuardians) {
        this.sendEventToUser(guardian.userId, 'alert_notification', alertData);
      }
      this.server.to('admin_control_room').emit('alert_notification', alertData);
      this.logger.log(
        `Aile Grubu (${familyId}) için velilere (${targetGuardians.length} kişi) ve admin_control_room odasına alarm bildirimi iletildi: ${alertData.title}`,
      );
    } catch (err) {
      this.logger.error(
        `Alarm bildirimi velilere gönderilirken hata oluştu: ${err.message}`,
      );
    }
  }

  @SubscribeMessage('video_call_request')
  async handleVideoCallRequest(
    @MessageBody() data: { targetUserId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const callerId = client.data.userId;
    if (!callerId) return { status: 'error', message: 'Yetkisiz.' };

    const caller = await this.prisma.user.findUnique({
      where: { id: callerId },
      select: { name: true },
    });

    const sent = this.sendEventToUser(data.targetUserId, 'video_call_invite', {
      callerId,
      callerName: caller?.name || 'Veli',
    });

    if (!sent) {
      // Çocuğun interneti/soketi kapalıysa OneSignal Push Bildirimi atarak telefonu uyandıralım
      await this.sendPushNotification(
        [data.targetUserId],
        '📞 GÖRÜNTÜLÜ ARAMA ÇAĞRISI',
        `${caller?.name || 'Veliniz'} görüntülü arama başlatmak istiyor.`,
        { action: 'incoming_video_call', callerId },
      );
    }

    return { status: 'success' };
  }

  @SubscribeMessage('video_call_response')
  handleVideoCallResponse(
    @MessageBody() data: { targetUserId: string; accepted: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const responderId = client.data.userId;
    if (!responderId) return { status: 'error', message: 'Yetkisiz.' };

    this.sendEventToUser(data.targetUserId, 'video_call_response', {
      responderId,
      accepted: data.accepted,
    });
    return { status: 'success' };
  }

  @SubscribeMessage('webrtc_signal')
  handleWebRTCSignal(
    @MessageBody() data: { targetUserId: string; signal: any },
    @ConnectedSocket() client: Socket,
  ) {
    const senderId = client.data.userId;
    if (!senderId) return { status: 'error', message: 'Yetkisiz.' };

    this.sendEventToUser(data.targetUserId, 'webrtc_signal', {
      senderId,
      signal: data.signal,
    });
    return { status: 'success' };
  }

  // Belirli bir kullanıcının tüm aktif soketlerine event gönderir
  sendEventToUser(userId: string, event: string, data: any): boolean {
    const sockets = this.activeUsers.get(userId);
    if (sockets && sockets.size > 0) {
      for (const socketId of sockets) {
        this.server.to(socketId).emit(event, data);
      }
      this.logger.log(
        `Kullanıcıya (${userId}) özel soket event'i gönderildi: ${event}`,
      );
      return true;
    }
    this.logger.warn(
      `Kullanıcı (${userId}) çevrimiçi olmadığı için soket event'i gönderilemedi: ${event}`,
    );
    return false;
  }
}
