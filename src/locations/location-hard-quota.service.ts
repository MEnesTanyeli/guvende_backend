import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LocationRateLimitException } from './location-rate-limit.service';

export const LOCATION_HARD_QUOTA = {
  capacity: 40_000,
  windowMs: 24 * 60 * 60_000,
} as const;

@Injectable()
export class LocationHardQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  async assertCanCreate(
    userId: string,
    newLocationCount: number,
    now = new Date(),
  ): Promise<void> {
    if (newLocationCount <= 0) return;
    const cutoff = new Date(now.getTime() - LOCATION_HARD_QUOTA.windowMs);
    const where = { userId, receivedAt: { gte: cutoff } };
    const existingCount = await this.prisma.location.count({ where });
    if (existingCount + newLocationCount <= LOCATION_HARD_QUOTA.capacity)
      return;

    const excess =
      existingCount + newLocationCount - LOCATION_HARD_QUOTA.capacity;
    const releasingRows = await this.prisma.location.findMany({
      where,
      select: { receivedAt: true },
      orderBy: { receivedAt: 'asc' },
      take: excess,
    });
    const releaseAt = releasingRows[releasingRows.length - 1]?.receivedAt;
    const retryAfterSeconds = releaseAt
      ? Math.max(
          1,
          Math.ceil(
            (releaseAt.getTime() +
              LOCATION_HARD_QUOTA.windowMs -
              now.getTime()) /
              1000,
          ),
        )
      : 24 * 60 * 60;

    throw new LocationRateLimitException(
      retryAfterSeconds,
      'LOCATION_STORAGE_QUOTA_ACTIVE',
    );
  }
}
