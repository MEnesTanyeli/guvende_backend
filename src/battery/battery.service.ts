import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateBatteryDto } from './dto/update-battery.dto';
import { AlertType, MemberType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionEntitlementService } from '../common/subscription-entitlement.service';

@Injectable()
export class BatteryService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private subscriptionEntitlement: SubscriptionEntitlementService,
  ) {}

  private isTrackableMember(member: {
    memberType: MemberType;
    guardianTrackingEnabled: boolean;
  }): boolean {
    return (
      member.memberType === MemberType.child ||
      member.memberType === MemberType.elder ||
      member.guardianTrackingEnabled
    );
  }

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
      select: {
        familyId: true,
        memberType: true,
        guardianTrackingEnabled: true,
      },
    });
    const trackableMemberships = (
      await Promise.all(
        memberships
          .filter((membership) => this.isTrackableMember(membership))
          .map(async (membership) => ({
            membership,
            entitled: await this.subscriptionEntitlement.isFamilyEntitled(
              membership.familyId,
            ),
          })),
      )
    )
      .filter(({ entitled }) => entitled)
      .map(({ membership }) => membership);

    // Dusuk sarj kontrolleri
    if (dto.batteryLevel <= 15 && !dto.isCharging) {
      const alertTitle = 'Dusuk Sarj Uyarisi';
      const alertMsg = `${user.name} adli aile uyesinin sarji %${dto.batteryLevel} seviyesine dustu!`;

      await this.notificationsService.raiseUserAlertForFamilies({
        familyIds: trackableMemberships.map(
          (membership) => membership.familyId,
        ),
        userId,
        type: AlertType.low_battery,
        title: alertTitle,
        message: alertMsg,
        metadata: { batteryLevel: dto.batteryLevel },
        notificationData: {
          type: 'low_battery',
          userId,
          batteryLevel: dto.batteryLevel,
        },
        dedupeActiveByUser: true,
      });
    } else if (dto.batteryLevel > 15 || dto.isCharging) {
      await this.notificationsService.resolveActiveAlerts(
        userId,
        AlertType.low_battery,
      );
    }

    return {
      message: 'Batarya durumu başarıyla güncellendi.',
      batteryLevel: dto.batteryLevel,
      isCharging: dto.isCharging,
    };
  }
}
