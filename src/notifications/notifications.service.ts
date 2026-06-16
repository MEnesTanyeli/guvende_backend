import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocationsGateway } from '../locations/locations.gateway';
import * as https from 'https';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('NotificationsService');

  constructor(
    private prisma: PrismaService,
    private locationsGateway: LocationsGateway,
  ) {}

  private async sendOneSignalNotification(userIds: string[], title: string, message: string, data?: any) {
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
          this.logger.log(`OneSignal Push Gönderim Sonucu: ${res.statusCode} | Gövde: ${responseBody}`);
          resolve({ statusCode: res.statusCode, body: responseBody });
        });
      });

      req.on('error', (err) => {
        this.logger.error(`OneSignal Push Gönderimi Hata Aldı: ${err.message}`);
        resolve({ error: err.message });
      });

      req.write(payloadStr);
      req.end();
    });
  }

  async sendNotification(userId: string, title: string, message: string, data?: any) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    const userName = user ? user.name : 'Bilinmeyen Kullanıcı';

    // FCM Simülasyonu - Konsola log olarak yazılır
    this.logger.log(
      `[FCM SIMULASYONU] Bildirim Gönderilen Kullanıcı: ${userName} (${userId}) | Başlık: "${title}" | Mesaj: "${message}" | Ek Veri: ${JSON.stringify(
        data || {},
      )}`,
    );

    return { success: true, userId, title, message };
  }

  async sendFamilyNotification(familyId: string, senderId: string, title: string, message: string, data?: any) {
    // Gönderenin rolünü sorgula
    const sender = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId: senderId,
        },
      },
      select: {
        memberType: true,
      },
    });

    // Aile üyelerini çek (gönderen kişi hariç)
    // Bildirimler sadece velilere (guardian) gidecektir, çocuk ve yaşlılar bildirim almayacaktır.
    const members = await this.prisma.familyMember.findMany({
      where: {
        familyId,
        userId: { not: senderId },
        muteNotifications: false,
        memberType: 'guardian',
      },
      select: {
        userId: true,
      },
    });

    this.logger.log(
      `[FCM SIMULASYONU] Aile Grubu (${familyId}) Bildirimi Tetiklendi. Gönderici: ${senderId} | Alıcı Sayısı: ${members.length}`,
    );

    // Canlı soket bildirimi yayınla (Gönderici rolünü de iletiyoruz)
    this.locationsGateway.sendAlertNotification(familyId, {
      title,
      message,
      senderId,
      senderRole: sender?.memberType,
      data,
      createdAt: new Date(),
    });

    let targetUserIds = members.map((member) => member.userId);
    if (senderId) {
      targetUserIds = targetUserIds.filter(id => id !== senderId);
    }

    // OneSignal üzerinden tüm aile üyelerine push bildirim gönder
    if (targetUserIds.length > 0) {
      await this.sendOneSignalNotification(targetUserIds, title, message, data);
    }

    const promises = members.map((member) =>
      this.sendNotification(member.userId, title, message, data),
    );

    await Promise.all(promises);

    return { success: true, recipientsCount: members.length };
  }
}
