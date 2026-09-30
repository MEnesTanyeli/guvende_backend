CREATE TYPE "AudibleWarningStatus" AS ENUM ('pending', 'received', 'muted', 'unanswered');

CREATE TABLE "audible_warnings" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "status" "AudibleWarningStatus" NOT NULL DEFAULT 'pending',
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "audible_warnings_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "alerts" ADD COLUMN "audibleWarningId" TEXT;

CREATE UNIQUE INDEX "alerts_audibleWarningId_key" ON "alerts"("audibleWarningId");
CREATE INDEX "audible_warnings_familyId_senderId_idx" ON "audible_warnings"("familyId", "senderId");
CREATE INDEX "audible_warnings_targetUserId_status_idx" ON "audible_warnings"("targetUserId", "status");

ALTER TABLE "alerts" ADD CONSTRAINT "alerts_audibleWarningId_fkey" FOREIGN KEY ("audibleWarningId") REFERENCES "audible_warnings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "audible_warnings" ADD CONSTRAINT "audible_warnings_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audible_warnings" ADD CONSTRAINT "audible_warnings_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "audible_warnings" ADD CONSTRAINT "audible_warnings_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
