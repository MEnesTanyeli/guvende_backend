import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { AlertType, MemberType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { LocationsGateway } from '../locations/locations.gateway';

interface DevicePermissions {
  timezone?: string;
}

@Injectable()
export class CronService {
  private readonly logger = new Logger('CronService');

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private locationsGateway: LocationsGateway,
  ) {}

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  // Mesafe hesabı için Haversine Formülü
  private getDistanceInMeters(
    lat1: number,
    lon1: number,
    lat2: number,
    lon2: number,
  ): number {
    const R = 6371000; // Dünya yarıçapı (metre)
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * (Math.PI / 180)) *
        Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private getIstanbulHour(date = new Date()): number {
    const hour = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Europe/Istanbul',
      hour: '2-digit',
      hour12: false,
    }).format(date);

    return Number(hour);
  }

  private isInInactivityQuietHours(date = new Date()): boolean {
    const hour = this.getIstanbulHour(date);
    return hour >= 0 && hour < 8;
  }

  private async getInactivityAlertFamilyIds(
    familyIds: string[],
    latitude: number,
    longitude: number,
  ): Promise<string[]> {
    const eligibleFamilyIds: string[] = [];

    for (const familyId of familyIds) {
      const safeZones = await this.prisma.safeZone.findMany({
        where: { familyId },
        select: {
          latitude: true,
          longitude: true,
          radius: true,
        },
      });

      const isInsideSafeZone = safeZones.some((zone) => {
        const distance = this.getDistanceInMeters(
          latitude,
          longitude,
          zone.latitude,
          zone.longitude,
        );
        return distance <= zone.radius;
      });

      if (!isInsideSafeZone) {
        eligibleFamilyIds.push(familyId);
      }
    }

    return eligibleFamilyIds;
  }

  // 1. Bağlantı Kesildi Kontrolü (Her 2 dakikada bir çalışır)
  @Cron('0 */2 * * * *')
  async handleConnectionLostCheck() {
    this.logger.log(
      'Bağlantı kesildi kontrolü zamanlanmış görevi başlatılıyor...',
    );

    const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000);

    // Aile grubunda üye olan tüm benzersiz kullanıcıları bul
    const activeMembers = await this.prisma.familyMember.findMany({
      where: {
        OR: [
          { memberType: { in: [MemberType.child, MemberType.elder] } },
          {
            memberType: MemberType.guardian,
            guardianTrackingEnabled: true,
          },
        ],
      },
      select: { userId: true, familyId: true },
    });

    const userFamiliesMap = new Map<string, string[]>();
    activeMembers.forEach((m) => {
      let families = userFamiliesMap.get(m.userId);
      if (!families) {
        families = [];
        userFamiliesMap.set(m.userId, families);
      }
      families.push(m.familyId);
    });

    for (const [userId, familyIds] of userFamiliesMap.entries()) {
      // Kullanıcının en son konum kaydını al
      const lastLocation = await this.prisma.location.findFirst({
        where: { userId },
        orderBy: { recordedAt: 'desc' },
      });

      const user = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { name: true },
      });

      const userName = user ? user.name : 'Bilinmeyen Üye';

      // Gorunur baglanti uyarisi 15 dakikalik kopmadan sonra uretilir.
      if (lastLocation && lastLocation.recordedAt < fifteenMinutesAgo) {
        // Cihazın veritabanındaki durumunu çevrimdışına çek (stale connection temizliği)
        if (lastLocation.connectionStatus !== 'offline') {
          await this.prisma.location.update({
            where: { id: lastLocation.id },
            data: { connectionStatus: 'offline' },
          });
          this.logger.log(
            `Kullanıcı (${userName} - ${userId}) cihazı uzun süredir konum göndermediği için çevrimdışı durumuna güncellendi.`,
          );
        }

        const alertTitle = 'Baglanti Kesildi';
        const alertMsg = `${userName} isimli uyenin cihazindan 15 dakikadir konum alinamiyor! Baglanti kesilmis olabilir.`;

        const alerts = await this.notificationsService.raiseUserAlertForFamilies({
          familyIds,
          userId,
          type: AlertType.connection_lost,
          title: alertTitle,
          message: alertMsg,
          metadata: {
            lastRecordedAt: lastLocation ? lastLocation.recordedAt : null,
          },
          notificationData: { type: 'connection_lost', userId },
          dedupeActiveByUser: true,
        });

        if (alerts.length > 0) {
          this.logger.warn(
            `${userName} (${userId}) icin baglanti koptu alarmi olusturuldu.`,
          );
        }
      }
    }
    this.logger.log('Bağlantı kesildi kontrolü zamanlanmış görevi tamamlandı.');
  }

  // 2. Hareketsizlik Kontrolü (Her 30 dakikada bir çalışır)
  @Cron('0 */30 * * * *')
  async handleInactivityCheck() {
    this.logger.log(
      'Hareketsizlik kontrolü zamanlanmış görevi başlatılıyor...',
    );

    if (this.isInInactivityQuietHours()) {
      this.logger.log(
        'Hareketsizlik kontrolu sessiz saatlerde oldugu icin bildirim uretilmedi.',
      );
      return;
    }

    const eightHoursAgo = new Date(Date.now() - 8 * 60 * 60 * 1000);
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);

    // Aile grubunda olan tüm benzersiz kullanıcıları bul
    const activeMembers = await this.prisma.familyMember.findMany({
      where: {
        OR: [
          { memberType: { in: [MemberType.child, MemberType.elder] } },
          {
            memberType: MemberType.guardian,
            guardianTrackingEnabled: true,
          },
        ],
      },
      select: { userId: true, familyId: true },
    });

    const userFamiliesMap = new Map<string, string[]>();
    activeMembers.forEach((m) => {
      let families = userFamiliesMap.get(m.userId);
      if (!families) {
        families = [];
        userFamiliesMap.set(m.userId, families);
      }
      families.push(m.familyId);
    });

    for (const [userId, familyIds] of userFamiliesMap.entries()) {
      // Son 8 saatteki konumları getir
      const locations = await this.prisma.location.findMany({
        where: {
          userId,
          recordedAt: { gte: eightHoursAgo },
        },
        orderBy: { recordedAt: 'desc' },
      });

      // Hareketsizlik tespiti için en az 2 konum olmalı, son konum aktif olmalı (30 dakikadan eski olmamalı)
      // ve bu konumların kapsadığı zaman aralığı en az 7.5 saat olmalı (yeni kullanıcılar için yanlış alarm verilmemesi amacıyla)
      if (
        locations.length >= 2 &&
        locations[0].recordedAt >= thirtyMinutesAgo &&
        locations[0].recordedAt.getTime() -
          locations[locations.length - 1].recordedAt.getTime() >=
          7.5 * 60 * 60 * 1000
      ) {
        const latestLoc = locations[0];

        // Son 8 saatteki tüm noktalar son noktaya 20 metreden yakın mı?
        const isInactive = locations.every((loc) => {
          const distance = this.getDistanceInMeters(
            loc.latitude,
            loc.longitude,
            latestLoc.latitude,
            latestLoc.longitude,
          );
          return distance <= 20;
        });

        if (isInactive) {
          const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: { name: true },
          });
          const userName = user ? user.name : 'Bilinmeyen Üye';

          const alertTitle = 'Hareketsizlik Uyarisi';
          const alertMsg = `${userName} son 8 saattir ayni bolgede hareketsiz kalmistir. Bir durum degisikligi olabilir.`;

          const alertFamilyIds = await this.getInactivityAlertFamilyIds(
            familyIds,
            latestLoc.latitude,
            latestLoc.longitude,
          );

          if (alertFamilyIds.length === 0) {
            this.logger.log(
              `${userName} (${userId}) guvenli bolgede oldugu icin hareketsizlik bildirimi uretilmedi.`,
            );
            continue;
          }

          const alerts =
            await this.notificationsService.raiseUserAlertForFamilies({
              familyIds: alertFamilyIds,
              userId,
              type: AlertType.inactivity,
              title: alertTitle,
              message: alertMsg,
              metadata: {
                radius: 20,
                hours: 8,
                skippedSafeZones: familyIds.length - alertFamilyIds.length,
              },
              notificationData: { type: 'inactivity', userId },
              dedupeActiveByUser: true,
            });

          if (alerts.length > 0) {
            this.logger.warn(
              `${userName} (${userId}) icin hareketsizlik alarmi olusturuldu.`,
            );
          }
        }
      }
    }
    this.logger.log('Hareketsizlik kontrolü zamanlanmış görevi tamamlandı.');
  }

  // 3. İlaç Hatırlatıcı Kontrolü (Her dakika çalışır)
  @Cron('0 * * * * *')
  async handleMedicationReminderCheck() {
    this.logger.log(
      'İlaç hatırlatıcı kontrolü zamanlanmış görevi başlatılıyor...',
    );

    // Aktif tüm hatırlatıcıları çekiyoruz (Kullanıcı saat dilimini sorgulayabilmek için)
    const activeReminders = await this.prisma.medicationReminder.findMany({
      where: {
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            devicePermissions: true,
          },
        },
      },
    });

    const filteredReminders = activeReminders.filter((reminder) => {
      // Kullanıcının saat dilimi bilgisini al, yoksa varsayılan Türkiye saatini kullan
      const permissions = reminder.user
        .devicePermissions as DevicePermissions | null;
      const userTimezone = permissions?.timezone ?? 'Europe/Istanbul';

      // 1. Saat kontrolü (Kullanıcının yerel saatine göre)
      const userLocalTime = new Date().toLocaleTimeString('tr-TR', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        timeZone: userTimezone,
      });

      if (reminder.time !== userLocalTime) {
        return false;
      }

      // 2. Tarih ve gün kontrolü (Kullanıcının yerel tarihine göre)
      const nowInUserTimezone = new Date(
        new Date().toLocaleString('en-US', { timeZone: userTimezone }),
      );
      const todayInUserTimezone = new Date(
        nowInUserTimezone.getFullYear(),
        nowInUserTimezone.getMonth(),
        nowInUserTimezone.getDate(),
      );

      const start = new Date(reminder.startDate);
      const startDateOnly = new Date(
        start.getFullYear(),
        start.getMonth(),
        start.getDate(),
      );

      // Gelecek tarihli ise tetikleme
      if (startDateOnly > todayInUserTimezone) {
        return false;
      }

      // Tekrar gün sınırı varsa kontrol et
      if (reminder.repeatDays && reminder.repeatDays > 0) {
        const msPerDay = 24 * 60 * 60 * 1000;
        const diffDays = Math.round(
          (todayInUserTimezone.getTime() - startDateOnly.getTime()) / msPerDay,
        );
        if (diffDays >= reminder.repeatDays) {
          return false; // Tekrar süresi dolmuş
        }
      }

      return true;
    });

    if (filteredReminders.length > 0) {
      this.logger.log(
        `${filteredReminders.length} adet aktif hatırlatıcı zaman dilimlerine göre tetikleniyor.`,
      );
    }

    for (const reminder of filteredReminders) {
      const sent = this.locationsGateway.sendEventToUser(
        reminder.userId,
        'medication_reminder_trigger',
        {
          reminderId: reminder.id,
          medicationName: reminder.medicationName,
          dosage: reminder.dosage,
          time: reminder.time,
          reminderType: reminder.reminderType,
        },
      );

      if (sent) {
        this.logger.log(
          `Hatırlatıcı alarmı (${reminder.medicationName}) kullanıcıya (${reminder.user.name}) canlı soket üzerinden iletildi.`,
        );
      } else {
        // Çevrimdışı durum: OneSignal Push Bildirimi göndererek telefonu uyandır/ses çal
        await this.notificationsService.sendOneSignalNotification(
          [reminder.userId],
          '💊 İLAÇ ALMA ZAMANI!',
          `Lütfen "${reminder.medicationName}" ilacınızı alın (Doz: ${reminder.dosage}).`,
          {
            action: 'play_warning_sound', // Ses çalmaya zorla
            medicationName: reminder.medicationName,
            reminderId: reminder.id,
          },
        );

        this.logger.warn(
          `Kullanıcı (${reminder.user.name}) çevrimdışı olduğu için ilaç hatırlatıcı OneSignal Push olarak gönderildi.`,
        );
      }
    }
  }

  // 4. Periyodik Konum Pingi (7, 10 ve 13. dakika civarinda denenir)
  @Cron('0 * * * * *')
  async handleSilentPingCheck() {
    this.logger.log('Sessiz konum pingi zamanlanmış görevi başlatılıyor...');

    const silentPingMinutes = new Set([7, 10, 13]);

    // Aktif tÃ¼m Ã¼yeleri bul
    const activeMembers = await this.prisma.familyMember.findMany({
      where: {
        OR: [
          { memberType: { in: [MemberType.child, MemberType.elder] } },
          {
            memberType: MemberType.guardian,
            guardianTrackingEnabled: true,
          },
        ],
      },
      select: { userId: true },
    });

    const uniqueUserIds = Array.from(
      new Set(activeMembers.map((m) => m.userId)),
    );

    for (const userId of uniqueUserIds) {
      // EÄŸer kullanÄ±cÄ± ÅŸu an WebSocket ile baÄŸlÄ±ysa ping gÃ¶ndermeye gerek yok
      if (this.locationsGateway.isUserConnected(userId)) {
        continue;
      }

      // KullanÄ±cÄ±nÄ±n en son konum kaydÄ±nÄ± al
      const lastLocation = await this.prisma.location.findFirst({
        where: { userId },
        orderBy: { recordedAt: 'desc' },
      });

      if (!lastLocation) {
        continue;
      }

      const ageMinutes = Math.floor(
        (Date.now() - lastLocation.recordedAt.getTime()) / (60 * 1000),
      );

      // 15. dakikadaki gorunur uyaridan once cihaz uyandirilmaya calisilir.
      if (silentPingMinutes.has(ageMinutes)) {
        this.logger.log(
          `Kullanici (${userId}) icin ${ageMinutes}. dakikada sessiz ping bildirimi gonderiliyor...`,
        );
        await this.locationsGateway.sendSilentPushNotification([userId], {
          action: 'ping',
          ageMinutes,
        });
      }
    }
    this.logger.log('Sessiz konum pingi zamanlanmış görevi tamamlandı.');
  }

  // 5. Eski Konum Kayıtlarını Temizleme (Her gece saat 03:00'te çalışır)
  @Cron('0 0 3 * * *')
  async handleLocationsCleanup() {
    this.logger.log(
      'Eski konum kayıtlarını temizleme zamanlanmış görevi başlatılıyor...',
    );

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    try {
      const deleteResult = await this.prisma.location.deleteMany({
        where: {
          recordedAt: {
            lt: thirtyDaysAgo,
          },
        },
      });

      this.logger.log(
        `Eski konum temizliği tamamlandı. Toplam silinen konum kaydı: ${deleteResult.count}`,
      );
    } catch (error) {
      this.logger.error(
        `Eski konum kayıtları temizlenirken hata oluştu: ${this.getErrorMessage(error)}`,
      );
    }
  }

  // Süresi uzun zaman önce dolmuş session kayıtlarını her gece temizle.
  // Yakın tarihli iptal kayıtları refresh-token tekrar kullanımını tespit etmek için korunur.
  @Cron('0 30 3 * * *')
  async handleSessionsCleanup() {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    try {
      const deleteResult = await this.prisma.session.deleteMany({
        where: { expiresAt: { lt: thirtyDaysAgo } },
      });
      this.logger.log(
        `Eski session temizliği tamamlandı. Silinen kayıt: ${deleteResult.count}`,
      );
    } catch (error) {
      this.logger.error(
        `Eski session kayıtları temizlenirken hata oluştu: ${this.getErrorMessage(error)}`,
      );
    }
  }
}
