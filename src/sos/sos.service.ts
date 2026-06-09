import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TriggerSosDto } from './dto/trigger-sos.dto';
import { AlertType, AlertStatus } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { LocationsGateway } from '../locations/locations.gateway';

@Injectable()
export class SosService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private locationsGateway: LocationsGateway,
  ) {}

  async triggerSos(userId: string, dto: TriggerSosDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    // Kullanıcının üye olduğu aileleri bul
    const memberships = await this.prisma.familyMember.findMany({
      where: { userId },
      select: { familyId: true },
    });

    if (memberships.length === 0) {
      throw new BadRequestException('Herhangi bir aile grubuna üye değilsiniz. SOS tetiklenemez.');
    }

    const sosEvents: any[] = [];

    // Her aile grubu için SOS kaydı ve alarm oluştur
    for (const membership of memberships) {
      const familyId = membership.familyId;

      // SOS Olayı Kaydet
      const sosEvent = await this.prisma.sosEvent.create({
        data: {
          userId,
          familyId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          message: dto.message || 'Yardıma ihtiyacım var!',
        },
      });

      sosEvents.push(sosEvent);

      // Alarm Kaydet
      const alertTitle = 'ACİL DURUM (SOS) UYARISI!';
      const alertMsg = `${user.name} ACİL DURUM çağrısı başlattı! Konum: ${dto.latitude}, ${dto.longitude}. Mesaj: ${dto.message || 'Yardıma ihtiyacım var!'}`;

      const alert = await this.prisma.alert.create({
        data: {
          familyId,
          userId,
          type: AlertType.sos,
          title: alertTitle,
          message: alertMsg,
          status: AlertStatus.active,
          metadata: {
            latitude: dto.latitude,
            longitude: dto.longitude,
            sosEventId: sosEvent.id,
            message: dto.message,
          },
        },
      });

      // Ailedeki diğer üyelere anlık bildirim (FCM) gönder
      await this.notificationsService.sendFamilyNotification(
        familyId,
        userId,
        alertTitle,
        alertMsg,
        {
          type: 'sos',
          userId,
          latitude: dto.latitude,
          longitude: dto.longitude,
          sosEventId: sosEvent.id,
        },
      );

      // WebSocket ile anlık odadaki üyelere duyur
      this.locationsGateway.sendLocationUpdate(familyId, {
        userId,
        latitude: dto.latitude,
        longitude: dto.longitude,
        sosEventId: sosEvent.id,
        isSos: true,
        message: dto.message || 'ACİL DURUM!',
        recordedAt: new Date(),
        user: { id: userId, name: user.name },
      });
    }

    return {
      message: 'SOS çağrısı başarıyla tüm aile gruplarına iletildi.',
      events: sosEvents,
    };
  }
}
