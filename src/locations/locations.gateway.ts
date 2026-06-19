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
    origin: '*',
  },
})
export class LocationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger('LocationsGateway');
  private activeUsers = new Map<string, Set<string>>();

  @WebSocketServer()
  server: Server;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private async sendPushNotification(userIds: string[], title: string, message: string, data?: any) {
    const appId = process.env.ONESIGNAL_APP_ID;
    const apiKey = process.env.ONESIGNAL_REST_API_KEY;

    if (!appId || !apiKey) {
      this.logger.warn('OneSignal App ID veya REST API Key eksik. Push bildirim gönderilemedi.');
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
        'Authorization': `Basic ${apiKey}`,
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
          this.logger.log(`LocationsGateway OneSignal Push Gönderim Sonucu: ${res.statusCode} | Gövde: ${responseBody}`);
          resolve({ statusCode: res.statusCode, body: responseBody });
        });
      });

      req.on('error', (err) => {
        this.logger.error(`LocationsGateway OneSignal Push Gönderimi Hata Aldı: ${err.message}`);
        resolve({ error: err.message });
      });

      req.write(payloadStr);
      req.end();
    });
  }

  async handleConnection(client: Socket) {
    try {
      const authHeader = client.handshake.auth?.token || client.handshake.headers?.authorization;
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
        this.logger.warn(`Soket bağlantısı reddedildi: Token bulunamadı. Cihaz: ${client.id}`);
        client.disconnect(true);
        return;
      }

      const payload = this.jwtService.verify(token, {
        secret: process.env.JWT_SECRET || 'guvende_gizli_anahtar_uretimde_degistirin',
      });
      const userId = payload.sub;

      if (!userId) {
        this.logger.warn(`Soket bağlantısı reddedildi: Geçersiz token payloadı. Cihaz: ${client.id}`);
        client.disconnect(true);
        return;
      }

      client.data.userId = userId;
      let userSockets = this.activeUsers.get(userId);
      if (!userSockets) {
        userSockets = new Set();
        this.activeUsers.set(userId, userSockets);
      }
      userSockets.add(client.id);
      this.logger.log(`Kullanıcı (${userId}) soket bağlantısı kurdu: ${client.id}`);
      
      // Veritabanındaki bağlantı durumunu çevrimiçi yap
      await this.updateUserConnectionStatus(userId, 'online');
    } catch (err) {
      this.logger.error(`Soket bağlantısı doğrulanamadı: ${err.message}. Cihaz: ${client.id}`);
      client.disconnect(true);
    }
  }

  async handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    if (userId) {
      const userSockets = this.activeUsers.get(userId);
      if (userSockets) {
        userSockets.delete(client.id);
        this.logger.log(`Kullanıcı (${userId}) bir soket bağlantısını kapattı: ${client.id}`);
        if (userSockets.size === 0) {
          this.activeUsers.delete(userId);
          this.logger.log(`Kullanıcı (${userId}) tamamen ayrıldı. Veritabanı çevrimdışı yapılıyor...`);
          
          // Veritabanındaki bağlantı durumunu çevrimdışı yap
          await this.updateUserConnectionStatus(userId, 'offline');
          
          // Tüm aile gruplarına bu kullanıcının çevrimdışı olduğunu bildir
          await this.broadcastUserOffline(userId);
        }
      }
    } else {
      this.logger.log(`Soket bağlantısı kesildi (anonim/yetkisiz): ${client.id}`);
    }
  }

  private async updateUserConnectionStatus(userId: string, status: 'online' | 'offline') {
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
        this.logger.log(`Kullanıcının (${userId}) son konum bağlantı durumu güncellendi: ${status}`);
      }
    } catch (err) {
      this.logger.error(`Bağlantı durumu güncellenirken hata oluştu (userId: ${userId}):`, err);
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
        this.logger.log(`Odaya (${room}) kullanıcının çevrimdışı olduğu bildirildi: ${userId}`);
      }
    } catch (err) {
      this.logger.error(`Çevrimdışı yayını yapılırken hata oluştu (userId: ${userId}):`, err);
    }
  }

  @SubscribeMessage('joinFamily')
  async handleJoinFamily(@MessageBody() data: { familyId: string }, @ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    if (!userId) {
      this.logger.warn(`Odaya katılım reddedildi: Kullanıcı kimliği doğrulanmamış.`);
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
      this.logger.warn(`Kullanıcı (${userId}) üye olmadığı odaya katılmaya çalıştı: family_${data.familyId}`);
      return { status: 'error', message: 'Bu aile odasına katılma yetkiniz yok.' };
    }

    const room = `family_${data.familyId}`;
    client.join(room);
    this.logger.log(`İstemci (${client.id}), odaya katıldı: ${room}`);
    return { status: 'success', room };
  }

  @SubscribeMessage('leaveFamily')
  async handleLeaveFamily(@MessageBody() data: { familyId: string }, @ConnectedSocket() client: Socket) {
    const userId = client.data.userId;
    if (!userId) {
      return { status: 'error', message: 'Yetkisiz erişim' };
    }

    const room = `family_${data.familyId}`;
    client.leave(room);
    this.logger.log(`İstemci (${client.id} - ${userId}), odadan ayrıldı: ${room}`);
    return { status: 'success', room };
  }

  @SubscribeMessage('sendAudibleWarning')
  async handleSendAudibleWarning(
    @MessageBody() data: { targetUserId: string },
    @ConnectedSocket() client: Socket,
  ) {
    const senderId = client.data.userId;
    if (!senderId) {
      return { status: 'error', message: 'Yetkisiz erişim.' };
    }

    const targetUserId = data.targetUserId;
    if (!targetUserId) {
      return { status: 'error', message: 'Hedef kullanıcı belirtilmedi.' };
    }

    // Yetki kontrolü: Gönderen kişi hedef kişinin bulunduğu bir grupta "veli" mi?
    const isAuthorized = await this.prisma.familyMember.findFirst({
      where: {
        userId: senderId,
        memberType: 'guardian',
        family: {
          members: {
            some: {
              userId: targetUserId,
            },
          },
        },
      },
    });

    if (!isAuthorized) {
      this.logger.warn(`Kullanıcı (${senderId}) yetkisi olmadan üye (${targetUserId}) için sesli uyarı göndermeye çalıştı.`);
      return { status: 'error', message: 'Bu üyeye sesli uyarı gönderme yetkiniz yok.' };
    }

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { name: true },
    });

    // Soket tetikleme akışını kaldırıyoruz. Alarmlar sadece OneSignal push bildirim yoluyla gidecek.
    /*
    const sent = this.sendEventToUser(targetUserId, 'audible_warning_trigger', {
      senderName: sender?.name || 'Veliniz',
      senderId,
    });
    */
    const sent = false;

    // Her durumda push bildirim gönder (arka planda uykuda olan cihazı uyandırmak için)
    await this.sendPushNotification(
      [targetUserId],
      '🚨 ACİL SESLİ UYARI!',
      `${sender?.name || 'Veliniz'} size sesli uyarı gönderdi!`,
      {
        action: 'play_warning_sound',
        senderName: sender?.name || 'Veliniz',
        senderId,
      }
    );

    if (sent) {
      return { status: 'success', message: 'Sesli uyarı başarıyla gönderildi.' };
    } else {
      return { status: 'success', message: 'Üye çevrimdışı, ancak sesli uyarı push bildirim olarak gönderildi.' };
    }
  }

  @SubscribeMessage('sendDeviceLock')
  async handleSendDeviceLock(
    @MessageBody() data: { targetUserId: string; lockState: boolean },
    @ConnectedSocket() client: Socket,
  ) {
    const senderId = client.data.userId;
    if (!senderId) {
      return { status: 'error', message: 'Yetkisiz erişim.' };
    }

    const { targetUserId, lockState } = data;
    if (!targetUserId) {
      return { status: 'error', message: 'Hedef kullanıcı belirtilmedi.' };
    }

    // Yetki kontrolü: Gönderen kişi hedef kişinin bulunduğu bir grupta "veli" mi?
    const isAuthorized = await this.prisma.familyMember.findFirst({
      where: {
        userId: senderId,
        memberType: 'guardian',
        family: {
          members: {
            some: {
              userId: targetUserId,
            },
          },
        },
      },
    });

    if (!isAuthorized) {
      this.logger.warn(`Kullanıcı (${senderId}) yetkisi olmadan üye (${targetUserId}) için cihaz kilidi sinyali göndermeye çalıştı.`);
      return { status: 'error', message: 'Bu üyeye cihaz kilidi sinyali gönderme yetkiniz yok.' };
    }

    // Veritabanındaki kilitleme durumunu güncelle
    await this.prisma.user.update({
      where: { id: targetUserId },
      data: { isLocked: lockState }
    });

    const sender = await this.prisma.user.findUnique({
      where: { id: senderId },
      select: { name: true },
    });

    // Canlı WebSocket kilitleme sinyalini ilet
    const sent = this.sendEventToUser(targetUserId, 'device_lock_trigger', {
      lockState,
      senderName: sender?.name || 'Veliniz',
      senderId,
    });

    // Her durumda cihaz kilitleme/açma durumunu bildirmek için push bildirim gönder
    await this.sendPushNotification(
      [targetUserId],
      lockState ? '🔒 Cihazınız Kilitlendi' : '🔓 Cihazınızın Kilidi Açıldı',
      lockState
        ? `${sender?.name || 'Veliniz'} cihazınızı uzaktan kilitledi.`
        : `${sender?.name || 'Veliniz'} cihazınızın kilidini açtı.`,
      {
        action: 'device_lock',
        lockState,
        senderName: sender?.name || 'Veliniz',
        senderId,
      }
    );

    if (sent) {
      return { status: 'success', message: `Cihaz kilidi durumu başarıyla iletildi.` };
    } else {
      return { status: 'success', message: 'Üye şu anda çevrimdışı, ancak kilit durumu kaydedildi ve push bildirim gönderildi.' };
    }
  }

  // Aile odasına konum güncellemesini yayınlar
  sendLocationUpdate(familyId: string, locationData: any) {
    const room = `family_${familyId}`;
    this.server.to(room).emit('location_update', locationData);
    this.logger.log(`Odaya (${room}) yeni konum yayını yapıldı: ${JSON.stringify(locationData.userId)}`);
  }

  // Aile odasındaki sadece velilere (guardian) alarm bildirimini gönderir
  async sendAlertNotification(familyId: string, alertData: any) {
    try {
      const senderId = alertData.senderId || alertData.userId || alertData.data?.userId;
      
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
        targetGuardians = guardians.filter(g => g.userId !== senderId);
      }

      for (const guardian of targetGuardians) {
        this.sendEventToUser(guardian.userId, 'alert_notification', alertData);
      }
      this.logger.log(`Aile Grubu (${familyId}) için velilere (${targetGuardians.length} kişi) alarm bildirimi iletildi: ${alertData.title}`);
    } catch (err) {
      this.logger.error(`Alarm bildirimi velilere gönderilirken hata oluştu: ${err.message}`);
    }
  }

  // Belirli bir kullanıcının tüm aktif soketlerine event gönderir
  sendEventToUser(userId: string, event: string, data: any): boolean {
    const sockets = this.activeUsers.get(userId);
    if (sockets && sockets.size > 0) {
      for (const socketId of sockets) {
        this.server.to(socketId).emit(event, data);
      }
      this.logger.log(`Kullanıcıya (${userId}) özel soket event'i gönderildi: ${event}`);
      return true;
    }
    this.logger.warn(`Kullanıcı (${userId}) çevrimiçi olmadığı için soket event'i gönderilemedi: ${event}`);
    return false;
  }
}
