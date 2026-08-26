import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { JoinFamilyDto } from './dto/join-family.dto';
import { AlertType, MemberType, Prisma } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FamiliesService {
  private readonly inviteCodeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  private createInviteCode(length = 8): string {
    let code = '';
    for (let i = 0; i < length; i += 1) {
      code +=
        this.inviteCodeAlphabet[
          Math.floor(Math.random() * this.inviteCodeAlphabet.length)
        ];
    }
    return code;
  }

  private async generateUniqueInviteCode(
    tx: Prisma.TransactionClient | PrismaService,
  ): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const inviteCode = this.createInviteCode();
      const existingFamily = await tx.family.findUnique({
        where: { inviteCode },
        select: { id: true },
      });

      if (!existingFamily) {
        return inviteCode;
      }
    }

    throw new ConflictException(
      'Aile davet kodu olusturulamadi. Lutfen tekrar deneyin.',
    );
  }

  async create(userId: string, dto: CreateFamilyDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, proxyId: true },
    });

    const isGuardian = user && user.role !== 'child' && user.role !== 'elder';
    if (!isGuardian) {
      throw new ForbiddenException(
        'Sadece veli hesapları yeni aile grubu oluşturabilir.',
      );
    }

    const duplicateName = await this.prisma.family.findFirst({
      where: {
        ownerId: userId,
        name: {
          equals: dto.name,
          mode: 'insensitive',
        },
      },
    });

    if (duplicateName) {
      throw new ConflictException(
        'Aynı isimde birden fazla aile grubu oluşturamazsınız.',
      );
    }

    const totalMemberships = await this.prisma.familyMember.count({
      where: { userId },
    });

    if (totalMemberships >= 2) {
      throw new ForbiddenException(
        'En fazla 2 aile grubunda yer alabilirsiniz.',
      );
    }

    // Aile kaydını oluştur ve oluşturanı otomatik olarak guardian (veli/koruyucu) olarak ekle
    return this.prisma.$transaction(async (tx) => {
      const inviteCode = await this.generateUniqueInviteCode(tx);
      const family = await tx.family.create({
        data: {
          inviteCode,
          name: dto.name,
          type: dto.type || 'general',
          ownerId: userId,
        },
      });

      await tx.familyMember.create({
        data: {
          familyId: family.id,
          userId: userId,
          memberType: MemberType.guardian,
          permissions: ['owner', 'all'],
        },
      });

      if (user.proxyId) {
        await tx.familyMember.create({
          data: {
            familyId: family.id,
            userId: user.proxyId,
            memberType: MemberType.guardian,
            permissions: ['all'],
          },
        });
      }

      return family;
    });
  }

  async findAll(userId: string) {
    // Kullanıcının üyesi olduğu tüm aileleri getir
    return this.prisma.family.findMany({
      where: {
        members: {
          some: {
            userId: userId,
          },
        },
      },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        members: {
          where: {
            userId: userId,
          },
          select: {
            muteNotifications: true,
            memberType: true,
            guardianTrackingEnabled: true,
          },
        },
        _count: {
          select: { members: true },
        },
      },
    });
  }

  async findOne(userId: string, familyId: string) {
    // Kullanıcının bu aile grubuna üye olup olmadığını doğrula
    const isMember = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (!isMember) {
      throw new ForbiddenException(
        'Bu aile grubunun verilerine erişim izniniz yok.',
      );
    }

    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        members: {
          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                gender: true,
                isLocked: true,
                devicePermissions: true,
              },
            },
          },
        },
        safeZones: true,
      },
    });

    if (!family) {
      throw new NotFoundException('Aile grubu bulunamadı.');
    }

    return family;
  }

  async invite(userId: string, familyId: string) {
    // Sadece veliler/koruyucular (guardian) davet kodu alabilir
    const membership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new ForbiddenException('Bu aile grubuna erişim izniniz yok.');
    }

    if (membership.memberType !== MemberType.guardian) {
      throw new ForbiddenException(
        'Sadece koruyucu (guardian) üyeler davet kodu oluşturabilir.',
      );
    }

    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      select: { inviteCode: true },
    });

    if (!family) {
      throw new NotFoundException('Aile grubu bulunamadi.');
    }

    let inviteCode = family.inviteCode;
    if (!inviteCode) {
      inviteCode = await this.generateUniqueInviteCode(this.prisma);
      await this.prisma.family.update({
        where: { id: familyId },
        data: { inviteCode },
      });
    }

    return {
      familyId,
      inviteCode,
      message:
        'Bu kodu diger uyelerle paylasarak aileye katilmalarini saglayabilirsiniz.',
    };
  }

  async join(userId: string, dto: JoinFamilyDto) {
    const familyIdOrInviteCode = dto.familyId.trim();
    const inviteCode = familyIdOrInviteCode.toUpperCase();
    const family = await this.prisma.family.findFirst({
      where: {
        OR: [{ inviteCode }, { id: familyIdOrInviteCode }],
      },
    });

    if (!family) {
      throw new NotFoundException('Geçersiz aile davet kodu.');
    }

    const joiningUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!joiningUser) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    // Üyelik limit kontrolü
    const currentMembershipsCount = await this.prisma.familyMember.count({
      where: { userId },
    });

    const isGuardian =
      joiningUser.role !== 'child' && joiningUser.role !== 'elder';
    if (isGuardian) {
      if (currentMembershipsCount >= 2) {
        throw new ForbiddenException(
          'Veliler en fazla 2 aile grubunda yer alabilir.',
        );
      }
    } else {
      if (currentMembershipsCount >= 1) {
        throw new ForbiddenException(
          'Çocuklar veya aile büyükleri sadece 1 aile grubunda yer alabilir.',
        );
      }
    }

    const existingMember = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId: family.id,
          userId,
        },
      },
    });

    if (existingMember) {
      throw new ConflictException('Zaten bu aile grubunun bir üyesisiniz.');
    }

    const memberTypeToUse =
      dto.memberType || (joiningUser.role as MemberType) || MemberType.child;

    if (memberTypeToUse === MemberType.guardian) {
      const guardianCount = await this.prisma.familyMember.count({
        where: {
          familyId: family.id,
          memberType: MemberType.guardian,
        },
      });

      if (guardianCount >= 2) {
        throw new ForbiddenException(
          'Bu aile grubunda zaten maksimum veli (2) sınırına ulaşılmış.',
        );
      }
    }

    return this.prisma.familyMember.create({
      data: {
        familyId: family.id,
        userId: userId,
        memberType: memberTypeToUse,
        permissions: [],
      },
      include: {
        family: {
          select: {
            name: true,
          },
        },
      },
    });
  }

  async updateMemberRole(
    userId: string,
    familyId: string,
    targetUserId: string,
    newRole: string,
  ) {
    // 1. Yetki Kontrolü: İstek yapan kişi bu aile grubunda "guardian" (veli) mi?
    const editorMembership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (!editorMembership) {
      throw new ForbiddenException('Bu aile grubuna üye değilsiniz.');
    }

    if (editorMembership.memberType !== MemberType.guardian) {
      throw new ForbiddenException(
        'Sadece koruyucu (guardian) üyeler başkalarının rollerini değiştirebilir.',
      );
    }

    // 2. Güncelleme yapılacak üyenin varlığını kontrol et
    const targetMembership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId: targetUserId,
        },
      },
    });

    if (!targetMembership) {
      throw new NotFoundException(
        'Güncellenmek istenen aile üyesi grupta bulunamadı.',
      );
    }

    // Aile sahibinin (owner) rolünü değiştirmeyi engelleyelim (veya grup kurucusunu)
    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
    });
    if (family && family.ownerId === targetUserId) {
      throw new ForbiddenException('Grup sahibinin rolü değiştirilemez.');
    }

    // 3. Rolü güncelle
    if (!Object.values(MemberType).includes(newRole as MemberType)) {
      throw new ConflictException('Geçersiz üye tipi.');
    }

    if (
      newRole === MemberType.guardian &&
      targetMembership.memberType !== MemberType.guardian
    ) {
      const guardianCount = await this.prisma.familyMember.count({
        where: {
          familyId: familyId,
          memberType: MemberType.guardian,
        },
      });

      if (guardianCount >= 2) {
        throw new ForbiddenException(
          'Bu aile grubunda zaten maksimum veli (2) sınırına ulaşılmış.',
        );
      }
    }

    return this.prisma.familyMember.update({
      where: {
        familyId_userId: {
          familyId,
          userId: targetUserId,
        },
      },
      data: {
        memberType: newRole as MemberType,
        guardianTrackingEnabled: false,
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            gender: true,
          },
        },
      },
    });
  }

  // Aile Grubundan Kendi İsteğiyle Ayrılma
  async leave(userId: string, familyId: string) {
    const membership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId, userId },
      },
      include: { user: true },
    });

    if (!membership) {
      throw new NotFoundException('Bu aile grubunun üyesi değilsiniz.');
    }

    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      include: { members: true },
    });

    if (!family) {
      throw new NotFoundException('Aile grubu bulunamadı.');
    }

    // Veli ayrılma kontrolü
    if (membership.memberType === MemberType.guardian) {
      const guardians = family.members.filter(
        (m) => m.memberType === MemberType.guardian,
      );

      if (guardians.length === 1) {
        // Grupta başka veli yoksa grubu tamamen sil/dağıt
        return this.deleteFamily(userId, familyId);
      }
    }

    // Çocuk veya Yaşlı ise velilere bildirim gönder ve alarm oluştur
    if (
      membership.memberType === MemberType.child ||
      membership.memberType === MemberType.elder
    ) {
      const alertTitle = 'UYARI: GRUPTAN AYRILMA';
      const alertMsg = `${membership.user.name} aile grubundan kendi istegiyle ayrildi ve konum takibi sonlandirildi!`;

      await this.notificationsService.raiseFamilyAlert({
        familyId,
        userId,
        type: AlertType.family_leave,
        title: alertTitle,
        message: alertMsg,
        notificationData: { type: 'family_leave', userId },
      });
    }

    // Üyelik kaydını sil
    await this.prisma.familyMember.delete({
      where: {
        familyId_userId: { familyId, userId },
      },
    });

    return {
      success: true,
      message: 'Aile grubundan başarıyla ayrıldınız.',
    };
  }

  // Gruptan Üye Çıkarma (Veli Yetkisiyle Kick)
  async removeMember(userId: string, familyId: string, targetUserId: string) {
    const editorMembership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId, userId },
      },
    });

    if (
      !editorMembership ||
      editorMembership.memberType !== MemberType.guardian
    ) {
      throw new ForbiddenException(
        'Sadece veli (guardian) rolündeki üyeler gruptan üye çıkarabilir.',
      );
    }

    const targetMembership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId, userId: targetUserId },
      },
      include: { user: true },
    });

    if (!targetMembership) {
      throw new NotFoundException(
        'Çıkarılmak istenen üye bu aile grubunda bulunamadı.',
      );
    }

    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
    });

    if (!family) {
      throw new NotFoundException('Aile grubu bulunamadı.');
    }

    if (family.ownerId === targetUserId) {
      throw new ForbiddenException('Grup kurucusu/sahibi gruptan çıkarılamaz.');
    }

    if (userId === targetUserId) {
      throw new ForbiddenException(
        'Kendinizi gruptan çıkaramazsınız. Gruptan ayrılmak için "Ayrıl" özelliğini kullanın.',
      );
    }

    // Çocuk veya Yaşlı çıkarıldıysa velilere alarm/bildirim gönder
    if (
      targetMembership.memberType === MemberType.child ||
      targetMembership.memberType === MemberType.elder
    ) {
      const alertTitle = 'UYARI: GRUPTAN ÇIKARILDI';
      const alertMsg = `${targetMembership.user.name}, veli tarafından aile grubundan çıkarıldı ve konum takibi sonlandırıldı!`;

      await this.notificationsService.raiseFamilyAlert({
        familyId,
        userId: targetUserId,
        type: AlertType.family_leave,
        title: alertTitle,
        message: alertMsg,
        notificationData: { type: 'family_leave', userId: targetUserId },
      });
    }

    // Üyelik kaydını sil
    await this.prisma.familyMember.delete({
      where: {
        familyId_userId: { familyId, userId: targetUserId },
      },
    });

    return {
      success: true,
      message: 'Üye aile grubundan başarıyla çıkarıldı.',
    };
  }

  // Aile Grubunu Tamamen Silme/Dağıtma
  async deleteFamily(userId: string, familyId: string) {
    const membership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId, userId },
      },
    });

    if (!membership || membership.memberType !== MemberType.guardian) {
      throw new ForbiddenException(
        'Sadece veli (guardian) üyeler grubu silebilir/dağıtabilir.',
      );
    }

    // Family tablosundaki kaydı siler, ilişkili üyeler, alarmlar, bölgeler CASCADE ile silinir
    await this.prisma.family.delete({
      where: { id: familyId },
    });

    return {
      success: true,
      message: 'Aile grubu başarıyla silindi ve dağıtıldı.',
    };
  }

  async muteNotifications(userId: string, familyId: string, mute: boolean) {
    const membership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Bu aile grubunun üyesi değilsiniz.');
    }

    return this.prisma.familyMember.update({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
      data: {
        muteNotifications: mute,
      },
    });
  }

  async updateOwnTracking(
    userId: string,
    familyId: string,
    enabled: boolean,
  ) {
    const membership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
    });

    if (!membership) {
      throw new NotFoundException('Bu aile grubunun uyesi degilsiniz.');
    }

    if (membership.memberType !== MemberType.guardian) {
      throw new ForbiddenException(
        'Cocuk ve yasli uyelerde takip ayari kapatilamaz.',
      );
    }

    return this.prisma.familyMember.update({
      where: {
        familyId_userId: {
          familyId,
          userId,
        },
      },
      data: {
        guardianTrackingEnabled: enabled,
      },
    });
  }
}
