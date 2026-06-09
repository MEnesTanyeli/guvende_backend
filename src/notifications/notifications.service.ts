import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger('NotificationsService');

  constructor(private prisma: PrismaService) {}

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
    // Aile üyelerini çek (gönderen kişi hariç)
    const members = await this.prisma.familyMember.findMany({
      where: {
        familyId,
        userId: { not: senderId },
      },
      select: {
        userId: true,
      },
    });

    this.logger.log(
      `[FCM SIMULASYONU] Aile Grubu (${familyId}) Bildirimi Tetiklendi. Gönderici: ${senderId} | Alıcı Sayısı: ${members.length}`,
    );

    const promises = members.map((member) =>
      this.sendNotification(member.userId, title, message, data),
    );

    await Promise.all(promises);

    return { success: true, recipientsCount: members.length };
  }
}
