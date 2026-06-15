import { ForbiddenException, Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateFamilyDto } from './dto/create-family.dto';
import { JoinFamilyDto } from './dto/join-family.dto';
import { MemberType } from '@prisma/client';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FamiliesService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService
  ) {}

  async create(userId: string, dto: CreateFamilyDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, proxyId: true },
    });

    const isGuardian = user && user.role !== 'child' && user.role !== 'elder';
    if (!isGuardian) {
      throw new ForbiddenException('Sadece veli hesapları yeni aile grubu oluşturabilir.');
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
      throw new ConflictException('Aynı isimde birden fazla aile grubu oluşturamazsınız.');
    }

    const existingFamiliesCount = await this.prisma.family.count({
      where: { ownerId: userId },
    });

    if (existingFamiliesCount >= 2) {
      throw new ForbiddenException('Bir üye en fazla 2 aile grubu oluşturabilir.');
    }

    // Aile kaydını oluştur ve oluşturanı otomatik olarak guardian (veli/koruyucu) olarak ekle
    return this.prisma.$transaction(async (tx) => {
      const family = await tx.family.create({
        data: {
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
      throw new ForbiddenException('Bu aile grubunun verilerine erişim izniniz yok.');
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
      throw new ForbiddenException('Sadece koruyucu (guardian) üyeler davet kodu oluşturabilir.');
    }

    return {
      familyId,
      inviteCode: familyId,
      message: 'Bu kodu diğer üyelerle paylaşarak aileye katılmalarını sağlayabilirsiniz.',
    };
  }

  async join(userId: string, dto: JoinFamilyDto) {
    const family = await this.prisma.family.findUnique({
      where: { id: dto.familyId },
    });

    if (!family) {
      throw new NotFoundException('Geçersiz aile davet kodu.');
    }

    const existingMember = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: {
          familyId: dto.familyId,
          userId,
        },
      },
    });

    if (existingMember) {
      throw new ConflictException('Zaten bu aile grubunun bir üyesisiniz.');
    }

    const joiningUser = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });

    if (!joiningUser) {
      throw new NotFoundException('Kullanıcı bulunamadı.');
    }

    const memberTypeToUse = dto.memberType || (joiningUser.role as MemberType) || MemberType.child;



    if (memberTypeToUse === MemberType.guardian) {
      const guardianCount = await this.prisma.familyMember.count({
        where: {
          familyId: dto.familyId,
          memberType: MemberType.guardian,
        },
      });

      if (guardianCount >= 2) {
        throw new ForbiddenException('Bu aile grubunda zaten maksimum veli (2) sınırına ulaşılmış.');
      }
    }

    return this.prisma.familyMember.create({
      data: {
        familyId: dto.familyId,
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

  async updateMemberRole(userId: string, familyId: string, targetUserId: string, newRole: string) {
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
      throw new ForbiddenException('Sadece koruyucu (guardian) üyeler başkalarının rollerini değiştirebilir.');
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
      throw new NotFoundException('Güncellenmek istenen aile üyesi grupta bulunamadı.');
    }

    // Aile sahibinin (owner) rolünü değiştirmeyi engelleyelim (veya grup kurucusunu)
    const family = await this.prisma.family.findUnique({
      where: { id: familyId }
    });
    if (family && family.ownerId === targetUserId) {
      throw new ForbiddenException('Grup sahibinin rolü değiştirilemez.');
    }

    // 3. Rolü güncelle
    if (!Object.values(MemberType).includes(newRole as MemberType)) {
      throw new ConflictException('Geçersiz üye tipi.');
    }

    if (newRole === MemberType.guardian && targetMembership.memberType !== MemberType.guardian) {
      const guardianCount = await this.prisma.familyMember.count({
        where: {
          familyId: familyId,
          memberType: MemberType.guardian,
        },
      });

      if (guardianCount >= 2) {
        throw new ForbiddenException('Bu aile grubunda zaten maksimum veli (2) sınırına ulaşılmış.');
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
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            gender: true,
          }
        }
      }
    });
  }

  // Aile Grubundan Kendi İsteğiyle Ayrılma
  async leave(userId: string, familyId: string) {
    const membership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId, userId }
      },
      include: { user: true }
    });

    if (!membership) {
      throw new NotFoundException('Bu aile grubunun üyesi değilsiniz.');
    }

    const family = await this.prisma.family.findUnique({
      where: { id: familyId },
      include: { members: true }
    });

    if (!family) {
      throw new NotFoundException('Aile grubu bulunamadı.');
    }

    // Veli ayrılma kontrolü
    if (membership.memberType === MemberType.guardian) {
      const guardians = family.members.filter(m => m.memberType === MemberType.guardian);
      
      if (guardians.length === 1) {
        // Grupta başka veli yoksa grubu tamamen sil/dağıt
        return this.deleteFamily(userId, familyId);
      }
    }

    // Çocuk veya Yaşlı ise velilere bildirim gönder ve alarm oluştur
    if (membership.memberType === MemberType.child || membership.memberType === MemberType.elder) {
      const remainingGuardians = family.members.filter(m => m.memberType === MemberType.guardian && m.userId !== userId);
      const alertTitle = '🚪 GRUPTAN AYRILMA';
      const alertMsg = `${membership.user.name} aile grubundan kendi isteğiyle ayrıldı ve konum takibi sonlandırıldı!`;

      // Her veli için veritabanında alarm oluştur
      for (const guardian of remainingGuardians) {
        await this.prisma.alert.create({
          data: {
            familyId,
            userId,
            type: 'family_leave',
            title: alertTitle,
            message: alertMsg,
            status: 'active'
          }
        });
      }

      // Kalan velilere push/socket bildirimi gönder
      await this.notificationsService.sendFamilyNotification(
        familyId,
        userId,
        alertTitle,
        alertMsg,
        { type: 'family_leave', userId }
      );
    }

    // Üyelik kaydını sil
    await this.prisma.familyMember.delete({
      where: {
        familyId_userId: { familyId, userId }
      }
    });

    return { success: true, message: 'Aile grubundan başarıyla ayrıldınız.' };
  }

  // Gruptan Üye Çıkarma (Veli Yetkisiyle Kick)
  async removeMember(userId: string, familyId: string, targetUserId: string) {
    const editorMembership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId, userId }
      }
    });

    if (!editorMembership || editorMembership.memberType !== MemberType.guardian) {
      throw new ForbiddenException('Sadece veli (guardian) rolündeki üyeler gruptan üye çıkarabilir.');
    }

    const targetMembership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId, userId: targetUserId }
      },
      include: { user: true }
    });

    if (!targetMembership) {
      throw new NotFoundException('Çıkarılmak istenen üye bu aile grubunda bulunamadı.');
    }

    const family = await this.prisma.family.findUnique({
      where: { id: familyId }
    });

    if (!family) {
      throw new NotFoundException('Aile grubu bulunamadı.');
    }

    if (family.ownerId === targetUserId) {
      throw new ForbiddenException('Grup kurucusu/sahibi gruptan çıkarılamaz.');
    }

    if (userId === targetUserId) {
      throw new ForbiddenException('Kendinizi gruptan çıkaramazsınız. Gruptan ayrılmak için "Ayrıl" özelliğini kullanın.');
    }

    // Çocuk veya Yaşlı çıkarıldıysa velilere alarm/bildirim gönder
    if (targetMembership.memberType === MemberType.child || targetMembership.memberType === MemberType.elder) {
      const alertTitle = '🚫 GRUPTAN ÇIKARILDI';
      const alertMsg = `${targetMembership.user.name}, veli tarafından aile grubundan çıkarıldı ve konum takibi sonlandırıldı!`;

      // Alarmı veritabanına kaydet
      await this.prisma.alert.create({
        data: {
          familyId,
          userId: targetUserId,
          type: 'family_leave',
          title: alertTitle,
          message: alertMsg,
          status: 'active'
        }
      });

      // Kalan velilere bildirim gönder
      await this.notificationsService.sendFamilyNotification(
        familyId,
        targetUserId,
        alertTitle,
        alertMsg,
        { type: 'family_leave', userId: targetUserId }
      );
    }

    // Üyelik kaydını sil
    await this.prisma.familyMember.delete({
      where: {
        familyId_userId: { familyId, userId: targetUserId }
      }
    });

    return { success: true, message: 'Üye aile grubundan başarıyla çıkarıldı.' };
  }

  // Aile Grubunu Tamamen Silme/Dağıtma
  async deleteFamily(userId: string, familyId: string) {
    const membership = await this.prisma.familyMember.findUnique({
      where: {
        familyId_userId: { familyId, userId }
      }
    });

    if (!membership || membership.memberType !== MemberType.guardian) {
      throw new ForbiddenException('Sadece veli (guardian) üyeler grubu silebilir/dağıtabilir.');
    }

    // Family tablosundaki kaydı siler, ilişkili üyeler, alarmlar, bölgeler CASCADE ile silinir
    await this.prisma.family.delete({
      where: { id: familyId }
    });

    return { success: true, message: 'Aile grubu başarıyla silindi ve dağıtıldı.' };
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
}

