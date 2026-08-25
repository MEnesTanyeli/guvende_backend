import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';
import { UsersService } from '../users/users.service';
import { AlertStatus, AlertType, MemberType } from '@prisma/client';
import { LocationsGateway } from '../locations/locations.gateway';

@Injectable()
export class MedicationsService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private locationsGateway: LocationsGateway,
  ) {}

  async createReminder(creatorId: string, dto: CreateMedicationDto) {
    const creatorProfile = await this.usersService.findOne(creatorId);
    if (!creatorProfile.isPremium) {
      throw new ForbiddenException(
        'İlaç Takibi özelliği sadece Premium üyeler içindir.',
      );
    }

    const targetUser = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });
    if (!targetUser) {
      throw new NotFoundException('İlaç atanacak üye bulunamadı.');
    }
    if (targetUser.role !== 'elder' && targetUser.role !== 'child') {
      throw new ForbiddenException(
        'İlaç hatırlatıcıları sadece çocuklar veya aile büyükleri için tanımlanabilir.',
      );
    }

    const commonFamily = await this.prisma.familyMember.findFirst({
      where: {
        userId: dto.userId,
        family: {
          members: {
            some: {
              userId: creatorId,
              memberType: MemberType.guardian,
            },
          },
        },
      },
    });

    if (!commonFamily) {
      throw new ForbiddenException(
        'Bu üyeye ilaç hatırlatıcısı ekleme yetkiniz yok.',
      );
    }

    return this.prisma.medicationReminder.create({
      data: {
        userId: dto.userId,
        medicationName: dto.medicationName,
        dosage: dto.dosage,
        time: dto.time,
        reminderType: dto.reminderType || 'medication',
        startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
        repeatDays: dto.repeatDays ? Number(dto.repeatDays) : null,
      },
    });
  }

  async getReminders(userId: string) {
    return this.prisma.medicationReminder.findMany({
      where: {
        userId,
        isActive: true,
      },
      orderBy: {
        time: 'asc',
      },
    });
  }

  async deleteReminder(reminderId: string, deleterId: string) {
    const reminder = await this.prisma.medicationReminder.findUnique({
      where: { id: reminderId },
    });

    if (!reminder) {
      throw new NotFoundException('İlaç hatırlatıcısı bulunamadı.');
    }

    const commonFamily = await this.prisma.familyMember.findFirst({
      where: {
        userId: reminder.userId,
        family: {
          members: {
            some: {
              userId: deleterId,
              memberType: MemberType.guardian,
            },
          },
        },
      },
    });

    if (!commonFamily) {
      throw new ForbiddenException(
        'Bu ilaç hatırlatıcısını silme yetkiniz yok.',
      );
    }

    return this.prisma.medicationReminder.delete({
      where: { id: reminderId },
    });
  }

  async takeMedication(reminderId: string, userId: string) {
    const reminder = await this.prisma.medicationReminder.findUnique({
      where: { id: reminderId },
      include: {
        user: true,
      },
    });

    if (!reminder) {
      throw new NotFoundException('İlaç hatırlatıcısı bulunamadı.');
    }

    if (reminder.userId !== userId) {
      throw new ForbiddenException('Bu ilaç size ait değil.');
    }

    const updated = await this.prisma.medicationReminder.update({
      where: { id: reminderId },
      data: {
        lastTakenAt: new Date(),
      },
    });

    const memberships = await this.prisma.familyMember.findMany({
      where: { userId },
    });

    let title = '💊 İlaç İçildi';
    let message = `${reminder.user.name} isimli üye "${reminder.medicationName}" ilacını içti.`;

    const rType = reminder.reminderType || 'medication';
    if (rType === 'appointment') {
      title = '📅 Randevuya Katılındı';
      message = `${reminder.user.name} isimli üye "${reminder.medicationName}" randevusunu onayladı.`;
    } else if (rType === 'water') {
      title = '🥤 Su İçildi';
      message = `${reminder.user.name} isimli üye "${reminder.medicationName}" su hatırlatıcısını onayladı.`;
    } else if (rType === 'checkin') {
      title = '🛡️ Kontrol Onaylandı';
      message = `${reminder.user.name} isimli üye "${reminder.medicationName}" kontrol uyarısını onayladı.`;
    } else if (rType === 'alarm') {
      title = '🚨 Alarm Onaylandı';
      message = `${reminder.user.name} isimli üye "${reminder.medicationName}" alarm uyarısını onayladı.`;
    }

    for (const membership of memberships) {
      const alert = await this.prisma.alert.create({
        data: {
          familyId: membership.familyId,
          userId: userId,
          type: AlertType.medication_taken,
          title,
          message,
          status: AlertStatus.active,
          metadata: {
            reminderId,
            medicationName: reminder.medicationName,
            dosage: reminder.dosage,
            time: reminder.time,
            reminderType: rType,
          },
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
      });

      await this.locationsGateway.sendAlertNotification(
        membership.familyId,
        alert,
      );
    }

    return updated;
  }

  async updateReminder(
    reminderId: string,
    updaterId: string,
    dto: UpdateMedicationDto,
  ) {
    const reminder = await this.prisma.medicationReminder.findUnique({
      where: { id: reminderId },
    });

    if (!reminder) {
      throw new NotFoundException('Hatırlatıcı bulunamadı.');
    }

    const commonFamily = await this.prisma.familyMember.findFirst({
      where: {
        userId: reminder.userId,
        family: {
          members: {
            some: {
              userId: updaterId,
              memberType: MemberType.guardian,
            },
          },
        },
      },
    });

    if (!commonFamily) {
      throw new ForbiddenException('Bu hatırlatıcıyı düzenleme yetkiniz yok.');
    }

    return this.prisma.medicationReminder.update({
      where: { id: reminderId },
      data: {
        medicationName: dto.medicationName,
        dosage: dto.dosage,
        time: dto.time,
        reminderType: dto.reminderType,
        startDate: dto.startDate ? new Date(dto.startDate) : undefined,
        repeatDays:
          dto.repeatDays !== undefined
            ? dto.repeatDays
              ? Number(dto.repeatDays)
              : null
            : undefined,
      },
    });
  }
}
