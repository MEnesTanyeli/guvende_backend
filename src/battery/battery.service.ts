import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBatteryDto } from './dto/update-battery.dto';
import { AlertStatus, AlertType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class BatteryService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async updateBattery(userId: string, dto: UpdateBatteryDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });

    if (!user) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    // Son konum kaydını bul ki koordinatları kopyalayabilelim
    const lastLoc = await this.prisma.location.findFirst({
      where: { userId },
      orderBy: { recordedAt: 'desc' },
    });

    if (!lastLoc) {
      throw new BadRequestException(
        'Batarya durumu güncellenmeden önce en az bir konum kaydı (koordinat içeren) bulunmalıdır.',
      );
    }

    // Yeni bir location kaydı oluşturarak tarihçede batarya değişimini tut
    await this.prisma.location.create({
      data: {
        userId,
        latitude: lastLoc.latitude,
        longitude: lastLoc.longitude,
        accuracy: lastLoc.accuracy,
        speed: lastLoc.speed,
        batteryLevel: dto.batteryLevel,
        isCharging: dto.isCharging,
        connectionStatus: lastLoc.connectionStatus,
      },
    });

    // Üye olunan aileleri bul
    const memberships = await this.prisma.familyMember.findMany({
      where: { userId },
      select: { familyId: true },
    });

    // Düşük şarj kontrolleri
    if (dto.batteryLevel <= 15 && !dto.isCharging) {
      const activeAlert = await this.prisma.alert.findFirst({
        where: {
          userId,
          type: AlertType.low_battery,
          status: AlertStatus.active,
        },
      });

      if (!activeAlert) {
        const alertTitle = 'Düşük Şarj Uyarısı';
        const alertMsg = `${user.name} adlı aile üyesinin şarjı %${dto.batteryLevel} seviyesine düştü!`;

        for (const membership of memberships) {
          await this.prisma.alert.create({
            data: {
              familyId: membership.familyId,
              userId,
              type: AlertType.low_battery,
              title: alertTitle,
              message: alertMsg,
              metadata: { batteryLevel: dto.batteryLevel },
            },
          });

          await this.notificationsService.sendFamilyNotification(
            membership.familyId,
            userId,
            alertTitle,
            alertMsg,
            { type: 'low_battery', userId, batteryLevel: dto.batteryLevel },
          );
        }
      }
    } else if (dto.batteryLevel > 15 || dto.isCharging) {
      // Aktif düşük şarj alarmlarını çöz
      await this.prisma.alert.updateMany({
        where: {
          userId,
          type: AlertType.low_battery,
          status: AlertStatus.active,
        },
        data: {
          status: AlertStatus.resolved,
          resolvedAt: new Date(),
        },
      });
    }

    return {
      message: 'Batarya durumu başarıyla güncellendi.',
      batteryLevel: dto.batteryLevel,
      isCharging: dto.isCharging,
    };
  }
}
