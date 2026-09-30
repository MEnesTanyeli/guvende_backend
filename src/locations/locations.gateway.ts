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
import { SubscriptionEntitlementService } from '../common/subscription-entitlement.service';

interface AccessTokenPayload {
  sub?: string;
  sid?: string;
  typ?: string;
  exp?: number;
}

interface SocketAuthData {
  userId?: string;
  sessionId?: string;
  authExpiryTimer?: NodeJS.Timeout;
}

type AuthenticatedSocket = Socket<
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  SocketAuthData
>;

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
    private subscriptionEntitlement: SubscriptionEntitlementService,
  ) {}

  disconnectUser(userId: string): void {
    const socketIds = new Set(this.activeUsers.get(userId) ?? []);
    // Include connections still completing their handshake.
    for (const socket of this.server?.sockets.sockets.values() ?? []) {
      if (socket.data.userId === userId) socketIds.add(socket.id);
    }

    for (const socketId of socketIds) {
      const socket = this.server?.sockets.sockets.get(socketId);
      if (!socket || socket.data.userId !== userId) continue;
      this.disconnectSocket(socket, userId);
    }
  }

  disconnectSessions(userId: string, sessionIds: readonly string[]): void {
    const revokedSessionIds = new Set(sessionIds);
    if (revokedSessionIds.size === 0) return;

    const socketIds = new Set(this.activeUsers.get(userId) ?? []);
    // Include authenticated connections not yet inserted into activeUsers.
    for (const socket of this.server?.sockets.sockets.values() ?? []) {
      if (socket.data.userId === userId) socketIds.add(socket.id);
    }

    for (const socketId of socketIds) {
      const socket = this.server?.sockets.sockets.get(socketId);
      if (
        !socket ||
        socket.data.userId !== userId ||
        !socket.data.sessionId ||
        !revokedSessionIds.has(socket.data.sessionId)
      ) {
        continue;
      }
      this.disconnectSocket(socket, userId, socket.data.sessionId);
    }
  }

  private disconnectSocket(
    socket: AuthenticatedSocket,
    userId: string,
    sessionId?: string,
  ): void {
    try {
      socket.disconnect(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Socket iptal baglantisi kesilemedi: user=${userId} session=${sessionId ?? 'all'} socket=${socket.id}: ${message}`,
      );
    }
  }

  clearFamilyRoom(familyId: string): void {
    const room = `family_${familyId}`;
    this.server?.in(room).socketsLeave(room);
  }

  isUserConnected(userId: string): boolean {
    const userSockets = this.activeUsers.get(userId);
    return !!(userSockets && userSockets.size > 0);
  }

  /** Remove every active device for a user from one family room only. */
  async revokeFamilyAccess(userId: string, familyId: string): Promise<void> {
    const socketIds = this.activeUsers.get(userId);
    if (!socketIds || socketIds.size === 0) return;

    const room = `family_${familyId}`;
    for (const socketId of socketIds) {
      const socket = this.server?.sockets.sockets.get(socketId);
      if (!socket) continue;
      try {
        await socket.leave(room);
        this.logger.log(
          `Kullanici (${userId}) aile odasindan cikarildi: ${room} | socket: ${socketId}`,
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `Aile odasi erisimi iptal edilemedi: user=${userId} room=${room} socket=${socketId}: ${message}`,
        );
      }
    }
  }

  private async sendPushNotification(
    userIds: string[],
    title: string,
    message: string,
    data?: Record<string, unknown>,
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

  async sendSilentPushNotification(
    userIds: string[],
    data: Record<string, unknown>,
  ) {
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

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const handshakeAuth = client.handshake.auth as { token?: unknown };
      const authToken = handshakeAuth.token;
      const headerToken = client.handshake.headers.authorization;
      const authHeader =
        typeof authToken === 'string' ? authToken : headerToken;
      let token = '';

      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      } else {
        const queryToken = client.handshake.query.token;
        if (typeof queryToken === 'string') {
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

      const payload = this.jwtService.verify<AccessTokenPayload>(token);
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
      client.use((_packet, next) => {
        void (async () => {
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
        })();
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
      // Deletion may commit while the handshake awaits database work.
      const stillActive = await this.prisma.session.findFirst({
        where: {
          id: session.id,
          userId,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        select: { id: true },
      });
      if (!stillActive) client.disconnect(true);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Soket bağlantısı doğrulanamadı: ${message}. Cihaz: ${client.id}`,
      );
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
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
    @ConnectedSocket() client: AuthenticatedSocket,
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

    if (!(await this.subscriptionEntitlement.isFamilyEntitled(data.familyId))) {
      return {
        status: 'error',
        message: 'Bu ailenin premium takip erişimi aktif değil.',
      };
    }

    const room = `family_${data.familyId}`;
    await client.join(room);
    const stillMember = await this.prisma.familyMember.findUnique({
      where: { familyId_userId: { familyId: data.familyId, userId } },
      select: { id: true },
    });
    if (!stillMember) {
      await client.leave(room);
      return { status: 'error', message: 'Aile erisimi kaldirildi.' };
    }
    this.logger.log(`İstemci (${client.id}), odaya katıldı: ${room}`);
    return { status: 'success' };
  }

  @SubscribeMessage('joinAdminControlRoom')
  async handleJoinAdminControlRoom(
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const userId = client.data.userId;
    if (!userId) {
      return { status: 'error', message: 'Yetkisiz erişim.' };
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!user || user.role !== 'admin') {
      return { status: 'error', message: 'Sadece yöneticiler katılabilir.' };
    }

    void client.join('admin_control_room');
    this.logger.log(
      `İstemci (${client.id}), admin_control_room odasına katıldı.`,
    );
    return { status: 'success' };
  }

  @SubscribeMessage('leaveFamily')
  handleLeaveFamily(
    @MessageBody() data: { familyId: string },
    @ConnectedSocket() client: AuthenticatedSocket,
  ) {
    const userId = client.data.userId;
    if (!userId) {
      return { status: 'error', message: 'Yetkisiz erişim' };
    }

    const room = `family_${data.familyId}`;
    void client.leave(room);
    this.logger.log(
      `İstemci (${client.id} - ${userId}), odadan ayrıldı: ${room}`,
    );
    return { status: 'success' };
  }

  @SubscribeMessage('sendDeviceLock')
  handleSendDeviceLock() {
    return {
      status: 'error',
      message: 'Cihaz kilitleme özelliği devre dışı bırakılmıştır.',
    };
  }

  // Aile odasına konum güncellemesini yayınlar
  async sendLocationUpdate(
    familyId: string,
    locationData: Record<string, unknown>,
    subscriptionExempt = false,
  ): Promise<void> {
    if (
      !subscriptionExempt &&
      !(await this.subscriptionEntitlement.isFamilyEntitled(familyId))
    ) {
      return;
    }
    const room = `family_${familyId}`;
    const senderId = locationData.userId;
    if (typeof senderId !== 'string') {
      this.logger.warn(
        `Konum yayini reddedildi: gecerli bir kullanici kimligi yok. family=${familyId}`,
      );
      return;
    }

    const members = await this.prisma.familyMember.findMany({
      where: { familyId },
      select: {
        userId: true,
        memberType: true,
        guardianTrackingEnabled: true,
      },
    });
    const sender = members.find((member) => member.userId === senderId);
    if (!sender) {
      this.logger.warn(
        `Konum yayini reddedildi: gonderen aile uyesi degil. user=${senderId} family=${familyId}`,
      );
      return;
    }

    const canGuardiansReceive =
      sender.memberType !== 'guardian' || sender.guardianTrackingEnabled;
    if (canGuardiansReceive) {
      for (const recipient of members) {
        if (
          recipient.userId === senderId ||
          recipient.memberType !== 'guardian'
        ) {
          continue;
        }

        const socketIds = this.activeUsers.get(recipient.userId);
        if (!socketIds) continue;

        for (const socketId of socketIds) {
          const socket = this.server?.sockets.sockets.get(socketId);
          if (socket?.rooms.has(room)) {
            socket.emit('location_update', locationData);
          }
        }
      }
    }

    this.server.to('admin_control_room').emit('location_update', locationData);
    this.logger.log(
      `Odaya (${room}) ve admin_control_room odasına yeni konum yayını yapıldı: ${JSON.stringify(locationData.userId)}`,
    );
  }

  // Aile odasındaki sadece velilere (guardian) alarm bildirimini gönderir
  async sendAlertNotification(
    familyId: string,
    alertData: Record<string, unknown> & {
      senderId?: string;
      userId?: string;
      data?: Record<string, unknown> & { userId?: string };
      title?: string;
    },
  ) {
    try {
      if (
        alertData.type !== 'sos' &&
        !(await this.subscriptionEntitlement.isFamilyEntitled(familyId))
      ) {
        return;
      }
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
      this.server
        .to('admin_control_room')
        .emit('alert_notification', alertData);
      this.logger.log(
        `Aile Grubu (${familyId}) için velilere (${targetGuardians.length} kişi) ve admin_control_room odasına alarm bildirimi iletildi: ${alertData.title}`,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(
        `Alarm bildirimi velilere gönderilirken hata oluştu: ${message}`,
      );
    }
  }

  /* Video call feature temporarily disabled.
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
      await this.sendPushNotification(
        [data.targetUserId],
        'GÖRÜNTÜLÜ ARAMA ÇAĞRISI',
        `${caller?.name || 'Veliniz'} görüntülü arama başlatmak istiyor.`,
        { action: 'incoming_video_call', callerId },
      );
    }

    return { status: 'success' };
  }
  */
  @SubscribeMessage('video_call_request')
  handleVideoCallRequestDisabled() {
    return {
      status: 'disabled',
      message: 'Goruntulu arama ozelligi gecici olarak kapali.',
    };
  }

  /* Video call feature temporarily disabled.
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
  */
  @SubscribeMessage('video_call_response')
  handleVideoCallResponseDisabled() {
    return {
      status: 'disabled',
      message: 'Goruntulu arama ozelligi gecici olarak kapali.',
    };
  }

  /* Video call feature temporarily disabled.
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
  */
  @SubscribeMessage('webrtc_signal')
  handleWebRTCSignalDisabled() {
    return {
      status: 'disabled',
      message: 'Goruntulu arama ozelligi gecici olarak kapali.',
    };
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
