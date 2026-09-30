import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AlertStatus, AlertType, Prisma, SosEvent } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LocationsGateway } from '../locations/locations.gateway';
import { TriggerSosDto } from './dto/trigger-sos.dto';

const SOS_COOLDOWN_MS = 60_000;

function toTitleCase(value: string): string {
  return value
    .toLowerCase()
    .split(' ')
    .map((word) => {
      if (!word) return '';
      let first = word.charAt(0);
      if (first === 'i') first = 'İ';
      else if (first === 'ı') first = 'I';
      else first = first.toUpperCase();
      return first + word.slice(1);
    })
    .join(' ');
}

type CommittedSos = {
  event: SosEvent;
  familyId: string;
  alertTitle: string;
  alertMessage: string;
};

type SosCommitResult =
  | { kind: 'duplicate'; events: SosEvent[] }
  | { kind: 'created'; events: CommittedSos[] };

@Injectable()
export class SosService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private locationsGateway: LocationsGateway,
  ) {}

  async triggerSos(userId: string, dto: TriggerSosDto) {
    let committed: SosCommitResult;
    try {
      committed = await this.prisma.$transaction(async (tx) => {
        // Serialize all SOS attempts for one user across backend instances.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`online-sos:${userId}`}, 0))`;

        const user = await tx.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });
        if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');

        const memberships = await tx.familyMember.findMany({
          where: { userId },
          select: { familyId: true },
          orderBy: { familyId: 'asc' },
        });
        if (memberships.length === 0) {
          throw new BadRequestException(
            'Herhangi bir aile grubuna üye değilsiniz. SOS tetiklenemez.',
          );
        }

        const familyIds = memberships.map(({ familyId }) => familyId);
        const existing = await tx.sosEvent.findMany({
          where: { userId, eventId: dto.eventId, familyId: { in: familyIds } },
          orderBy: { familyId: 'asc' },
        });
        if (existing.length > 0) {
          return { kind: 'duplicate' as const, events: existing };
        }

        const recent = await tx.sosEvent.findMany({
          where: {
            userId,
            familyId: { in: familyIds },
            createdAt: { gt: new Date(Date.now() - SOS_COOLDOWN_MS) },
          },
          select: { familyId: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        });
        const latestByFamily = new Map<string, Date>();
        for (const row of recent) {
          if (!latestByFamily.has(row.familyId)) {
            latestByFamily.set(row.familyId, row.createdAt);
          }
        }

        const eligibleFamilyIds = familyIds.filter(
          (familyId) => !latestByFamily.has(familyId),
        );
        if (eligibleFamilyIds.length === 0) {
          const retryAfterSeconds = Math.max(
            1,
            ...[...latestByFamily.values()].map((createdAt) =>
              Math.ceil(
                (createdAt.getTime() + SOS_COOLDOWN_MS - Date.now()) / 1000,
              ),
            ),
          );
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              error: 'Too Many Requests',
              code: 'SOS_COOLDOWN_ACTIVE',
              message: 'Yeni bir SOS göndermeden önce kısa bir süre bekleyin.',
              retryAfterSeconds,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        const alertTitle = 'ACİL DURUM (SOS) UYARISI!';
        const sosMessage = dto.message || 'Yardıma ihtiyacım var!';
        const alertMessage = `${toTitleCase(user.name)}: "${sosMessage}" (Konum: ${dto.latitude}, ${dto.longitude})`;
        const results: CommittedSos[] = [];

        for (const familyId of eligibleFamilyIds) {
          const event = await tx.sosEvent.create({
            data: {
              eventId: dto.eventId,
              userId,
              familyId,
              latitude: dto.latitude,
              longitude: dto.longitude,
              message: sosMessage,
            },
          });
          await tx.alert.create({
            data: {
              familyId,
              userId,
              type: AlertType.sos,
              title: alertTitle,
              message: alertMessage,
              status: AlertStatus.active,
              metadata: {
                latitude: dto.latitude,
                longitude: dto.longitude,
                sosEventId: event.id,
                eventId: dto.eventId,
                message: dto.message,
              } as Prisma.InputJsonValue,
            },
          });
          results.push({ event, familyId, alertTitle, alertMessage });
        }
        return { kind: 'created' as const, events: results };
      });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== 'P2002'
      ) {
        throw error;
      }
      const existing = await this.prisma.sosEvent.findMany({
        where: { userId, eventId: dto.eventId },
        orderBy: { familyId: 'asc' },
      });
      if (existing.length === 0) throw error;
      committed = { kind: 'duplicate', events: existing };
    }

    if (committed.kind === 'duplicate') {
      return {
        message: 'SOS çağrısı daha önce tüm aile gruplarına iletildi.',
        events: committed.events,
        idempotent: true,
      };
    }

    // External effects run after the complete SOS/Alert transaction commits.
    await Promise.allSettled(
      committed.events.map(
        async ({ event, familyId, alertTitle, alertMessage }) => {
          await this.notificationsService.sendFamilyNotification(
            familyId,
            userId,
            alertTitle,
            alertMessage,
            {
              type: 'sos',
              userId,
              latitude: dto.latitude,
              longitude: dto.longitude,
              sosEventId: event.id,
              eventId: dto.eventId,
            },
          );
          await this.locationsGateway.sendLocationUpdate(
            familyId,
            {
              userId,
              latitude: dto.latitude,
              longitude: dto.longitude,
              sosEventId: event.id,
              eventId: dto.eventId,
              isSos: true,
              message: dto.message || 'ACİL DURUM!',
              recordedAt: event.createdAt,
            },
            true,
          );
        },
      ),
    );

    return {
      message: 'SOS çağrısı başarıyla tüm aile gruplarına iletildi.',
      events: committed.events.map(({ event }) => event),
      idempotent: false,
    };
  }
}
