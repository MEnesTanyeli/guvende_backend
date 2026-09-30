ALTER TABLE "audible_warnings" ADD COLUMN "eventId" TEXT;

CREATE UNIQUE INDEX "audible_warnings_senderId_targetUserId_eventId_key"
ON "audible_warnings"("senderId", "targetUserId", "eventId");

CREATE INDEX "audible_warnings_senderId_targetUserId_createdAt_idx"
ON "audible_warnings"("senderId", "targetUserId", "createdAt");

CREATE INDEX "audible_warnings_targetUserId_createdAt_idx"
ON "audible_warnings"("targetUserId", "createdAt");
