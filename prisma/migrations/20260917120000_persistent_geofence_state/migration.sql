CREATE TABLE "geofence_states" (
    "userId" TEXT NOT NULL,
    "safeZoneId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unknown',
    "candidate" TEXT,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "candidateSince" TIMESTAMP(3),
    "lastObservedAt" TIMESTAMP(3),
    "lastReliableAt" TIMESTAMP(3),
    "lastLatitude" DOUBLE PRECISION,
    "lastLongitude" DOUBLE PRECISION,
    "lastAccuracy" DOUBLE PRECISION,
    CONSTRAINT "geofence_states_pkey" PRIMARY KEY ("userId", "safeZoneId")
);
CREATE INDEX "geofence_states_safeZoneId_idx" ON "geofence_states"("safeZoneId");
ALTER TABLE "geofence_states" ADD CONSTRAINT "geofence_states_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "geofence_states" ADD CONSTRAINT "geofence_states_safeZoneId_fkey"
  FOREIGN KEY ("safeZoneId") REFERENCES "safe_zones"("id") ON DELETE CASCADE ON UPDATE CASCADE;
