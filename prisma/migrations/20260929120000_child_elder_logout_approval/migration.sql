ALTER TABLE "users"
ADD COLUMN "deviceLoginBlocked" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE "child_elder_logout_approvals" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "tokenFamilyId" TEXT NOT NULL,
    "deviceId" TEXT,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "blockedUntil" TIMESTAMP(3),
    "lastSentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hourlySendCount" INTEGER NOT NULL DEFAULT 1,
    "hourlyWindowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dailySendCount" INTEGER NOT NULL DEFAULT 1,
    "dailyWindowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "child_elder_logout_approvals_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "child_elder_logout_approvals_userId_key"
ON "child_elder_logout_approvals"("userId");

CREATE INDEX "child_elder_logout_approvals_expiresAt_idx"
ON "child_elder_logout_approvals"("expiresAt");

ALTER TABLE "child_elder_logout_approvals"
ADD CONSTRAINT "child_elder_logout_approvals_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "child_elder_logout_approvals"
ADD CONSTRAINT "child_elder_logout_approvals_familyId_fkey"
FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "child_elder_logout_approvals"
ADD CONSTRAINT "child_elder_logout_approvals_ownerId_fkey"
FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
