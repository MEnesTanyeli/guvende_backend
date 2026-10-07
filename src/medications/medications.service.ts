import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMedicationDto } from './dto/create-medication.dto';
import { UpdateMedicationDto } from './dto/update-medication.dto';
import { UsersService } from '../users/users.service';
import { AlertType, MemberType, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';
import { SubscriptionEntitlementService } from '../common/subscription-entitlement.service';
import { FamilyMembershipLockService } from '../common/family-membership-lock.service';

type MedicationMembershipClient = Pick<
  Prisma.TransactionClient,
  'familyMember'
>;

@Injectable()
export class MedicationsService {
  constructor(
    private prisma: PrismaService,
    private usersService: UsersService,
    private notificationsService: NotificationsService,
    private subscriptionEntitlement: SubscriptionEntitlementService,
    private familyMembershipLock: FamilyMembershipLockService = new FamilyMembershipLockService(),
  ) {}

  private async findAuthorizationFamilyIds(
    client: MedicationMembershipClient,
    requesterId: string,
    targetUserId: string,
    candidateFamilyIds?: string[],
  ): Promise<string[]> {
    const where: Prisma.FamilyMemberWhereInput = {
      userId: targetUserId,
      family: {
        members: {
          some: {
            userId: requesterId,
            memberType: MemberType.guardian,
          },
        },
      },
    };

    if (requesterId !== targetUserId) {
      where.memberType = { in: [MemberType.child, MemberType.elder] };
    }
    if (candidateFamilyIds) {
      where.familyId = { in: candidateFamilyIds };
    }

    const memberships = await client.familyMember.findMany({
      where,
      select: { familyId: true },
    });

    return [...new Set(memberships.map(({ familyId }) => familyId))].sort();
  }

  private async lockAndFindAuthorizationFamily(
    tx: Prisma.TransactionClient,
    requesterId: string,
    targetUserId: string,
    candidateFamilyIds: string[],
    forbiddenMessage: string,
  ): Promise<string> {
    const sortedFamilyIds = [...new Set(candidateFamilyIds)].sort();
    for (const familyId of sortedFamilyIds) {
      await this.familyMembershipLock.lockFamilyMembership(tx, familyId);
    }

    const authorizedFamilyIds = await this.findAuthorizationFamilyIds(
      tx,
      requesterId,
      targetUserId,
      sortedFamilyIds,
    );
    const authorizedFamilyId = authorizedFamilyIds[0];
    if (!authorizedFamilyId) {
      throw new ForbiddenException(forbiddenMessage);
    }

    return authorizedFamilyId;
  }

  private async assertChildOrElderUser(
    tx: Prisma.TransactionClient,
    targetUserId: string,
    notFoundMessage: string,
    forbiddenMessage: string,
  ): Promise<void> {
    const targetUser = await tx.user.findUnique({
      where: { id: targetUserId },
      select: { role: true },
    });
    if (!targetUser) {
      throw new NotFoundException(notFoundMessage);
    }
    if (targetUser.role !== 'elder' && targetUser.role !== 'child') {
      throw new ForbiddenException(forbiddenMessage);
    }
  }

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

    const candidateFamilyIds = await this.findAuthorizationFamilyIds(
      this.prisma,
      creatorId,
      dto.userId,
    );
    if (candidateFamilyIds.length === 0) {
      throw new ForbiddenException(
        'Bu üyeye ilaç hatırlatıcısı ekleme yetkiniz yok.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const familyId = await this.lockAndFindAuthorizationFamily(
        tx,
        creatorId,
        dto.userId,
        candidateFamilyIds,
        'Bu üyeye ilaç hatırlatıcısı ekleme yetkiniz yok.',
      );

      await this.assertChildOrElderUser(
        tx,
        dto.userId,
        'İlaç atanacak üye bulunamadı.',
        'İlaç hatırlatıcıları sadece çocuklar veya aile büyükleri için tanımlanabilir.',
      );
      await this.subscriptionEntitlement.assertFamilyEntitled(familyId, tx);

      return tx.medicationReminder.create({
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
    });
  }

  async getReminders(requesterId: string, targetUserId: string) {
    if (requesterId !== targetUserId) {
      const authorizedMembership = await this.prisma.familyMember.findFirst({
        where: {
          userId: targetUserId,
          memberType: { in: [MemberType.child, MemberType.elder] },
          family: {
            members: {
              some: {
                userId: requesterId,
                memberType: MemberType.guardian,
              },
            },
          },
        },
        select: { id: true, familyId: true },
      });

      if (!authorizedMembership) {
        // Keep the established 200/[] contract for an unknown target. Existing
        // users without an authorized guardian relationship are forbidden.
        const targetUser = await this.prisma.user.findUnique({
          where: { id: targetUserId },
          select: { id: true },
        });
        if (targetUser) {
          throw new ForbiddenException(
            'Bu kullanıcının ilaç bilgilerini görmeye yetkiniz yok.',
          );
        }
      } else {
        await this.subscriptionEntitlement.assertFamilyEntitled(
          authorizedMembership.familyId,
        );
      }
    } else {
      const membership = await this.prisma.familyMember.findFirst({
        where: { userId: targetUserId },
        select: { familyId: true },
      });
      if (membership) {
        await this.subscriptionEntitlement.assertFamilyEntitled(
          membership.familyId,
        );
      }
    }

    return this.prisma.medicationReminder.findMany({
      where: {
        userId: targetUserId,
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

    const candidateFamilyIds = await this.findAuthorizationFamilyIds(
      this.prisma,
      deleterId,
      reminder.userId,
    );
    if (candidateFamilyIds.length === 0) {
      throw new ForbiddenException(
        'Bu ilaç hatırlatıcısını silme yetkiniz yok.',
      );
    }
    return this.prisma.$transaction(async (tx) => {
      const familyId = await this.lockAndFindAuthorizationFamily(
        tx,
        deleterId,
        reminder.userId,
        candidateFamilyIds,
        'Bu ilaç hatırlatıcısını silme yetkiniz yok.',
      );

      const currentReminder = await tx.medicationReminder.findFirst({
        where: { id: reminderId, userId: reminder.userId },
      });
      if (!currentReminder) {
        throw new NotFoundException('İlaç hatırlatıcısı bulunamadı.');
      }
      if (deleterId !== currentReminder.userId) {
        await this.assertChildOrElderUser(
          tx,
          currentReminder.userId,
          'İlaç atanacak üye bulunamadı.',
          'Bu ilaç hatırlatıcısını silme yetkiniz yok.',
        );
      }
      await this.subscriptionEntitlement.assertFamilyEntitled(familyId, tx);

      return tx.medicationReminder.delete({
        where: { id: reminderId, userId: currentReminder.userId },
      });
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
      await this.notificationsService.raiseFamilyAlert({
        familyId: membership.familyId,
        userId,
        type: AlertType.medication_taken,
        title,
        message,
        metadata: {
          reminderId,
          medicationName: reminder.medicationName,
          dosage: reminder.dosage,
          time: reminder.time,
          reminderType: rType,
        },
        delivery: 'socket',
      });
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

    const candidateFamilyIds = await this.findAuthorizationFamilyIds(
      this.prisma,
      updaterId,
      reminder.userId,
    );
    if (candidateFamilyIds.length === 0) {
      throw new ForbiddenException('Bu hatırlatıcıyı düzenleme yetkiniz yok.');
    }
    return this.prisma.$transaction(async (tx) => {
      const familyId = await this.lockAndFindAuthorizationFamily(
        tx,
        updaterId,
        reminder.userId,
        candidateFamilyIds,
        'Bu hatırlatıcıyı düzenleme yetkiniz yok.',
      );

      const currentReminder = await tx.medicationReminder.findFirst({
        where: { id: reminderId, userId: reminder.userId },
      });
      if (!currentReminder) {
        throw new NotFoundException('Hatırlatıcı bulunamadı.');
      }
      if (updaterId !== currentReminder.userId) {
        await this.assertChildOrElderUser(
          tx,
          currentReminder.userId,
          'Hatırlatıcı bulunamadı.',
          'Bu hatırlatıcıyı düzenleme yetkiniz yok.',
        );
      }
      await this.subscriptionEntitlement.assertFamilyEntitled(familyId, tx);

      return tx.medicationReminder.update({
        where: { id: reminderId, userId: currentReminder.userId },
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
    });
  }
}
