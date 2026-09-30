ALTER TABLE "sos_events" ADD COLUMN "eventId" TEXT;

CREATE UNIQUE INDEX "sos_events_userId_familyId_eventId_key"
ON "sos_events"("userId", "familyId", "eventId");

CREATE INDEX "sos_events_userId_familyId_createdAt_idx"
ON "sos_events"("userId", "familyId", "createdAt");
