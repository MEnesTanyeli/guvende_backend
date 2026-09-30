import { ForbiddenException } from '@nestjs/common';
import { MemberType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Shared policy for read-only tracking data such as Activity and App Usage. */
export async function assertCanReadTrackingData(
  prisma: PrismaService,
  requesterId: string,
  targetUserId: string,
  options: { includeTemporalBoundary?: boolean } = {},
): Promise<Date | undefined> {
  if (requesterId === targetUserId) return;

  const entitlementFilter =
    process.env.EARLY_ACCESS_ENABLED === 'true'
      ? {}
      : {
          owner: {
            OR: [
              { trialEndsAt: { gt: new Date() } },
              { isPremium: true, premiumExpiresAt: { gt: new Date() } },
            ],
          },
        };

  if (!options.includeTemporalBoundary) {
    const authorizedMembership = await prisma.familyMember.findFirst({
      where: {
        userId: targetUserId,
        memberType: { in: [MemberType.child, MemberType.elder] },
        family: {
          ...entitlementFilter,
          members: {
            some: {
              userId: requesterId,
              memberType: MemberType.guardian,
            },
          },
        },
      },
      select: { id: true },
    });

    if (!authorizedMembership) {
      throw new ForbiddenException(
        'Bu kullanicinin takip verilerini gormeye yetkiniz yok.',
      );
    }
    return;
  }

  const authorizedMemberships = await prisma.familyMember.findMany({
    where: {
      userId: targetUserId,
      memberType: { in: [MemberType.child, MemberType.elder] },
      family: {
        ...entitlementFilter,
        members: {
          some: {
            userId: requesterId,
            memberType: MemberType.guardian,
          },
        },
      },
    },
    select: {
      createdAt: true,
      family: {
        select: {
          members: {
            where: {
              userId: requesterId,
              memberType: MemberType.guardian,
            },
            select: { createdAt: true },
          },
        },
      },
    },
  });

  const authorizedStarts = authorizedMemberships.flatMap((membership) =>
    membership.family.members.map(
      (requesterMembership) =>
        new Date(
          Math.max(
            requesterMembership.createdAt.getTime(),
            membership.createdAt.getTime(),
          ),
        ),
    ),
  );

  if (authorizedStarts.length === 0) {
    throw new ForbiddenException(
      'Bu kullanicinin takip verilerini gormeye yetkiniz yok.',
    );
  }

  return new Date(
    Math.min(...authorizedStarts.map((startedAt) => startedAt.getTime())),
  );
}
