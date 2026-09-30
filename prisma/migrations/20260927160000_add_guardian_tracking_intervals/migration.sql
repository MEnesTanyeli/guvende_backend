-- Historical sharing windows for guardian-to-guardian Location History access.
CREATE TABLE "guardian_tracking_intervals" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "guardianUserId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),

    CONSTRAINT "guardian_tracking_intervals_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "guardian_tracking_intervals_valid_range_check"
        CHECK ("endedAt" IS NULL OR "endedAt" >= "startedAt")
);

CREATE INDEX "guardian_tracking_intervals_lookup_idx"
ON "guardian_tracking_intervals"("familyId", "guardianUserId", "startedAt", "endedAt");

-- PostgreSQL partial uniqueness prevents concurrent requests from creating
-- more than one open interval for the same guardian in the same family.
CREATE UNIQUE INDEX "guardian_tracking_intervals_one_open_per_guardian_family"
ON "guardian_tracking_intervals"("familyId", "guardianUserId")
WHERE "endedAt" IS NULL;

ALTER TABLE "guardian_tracking_intervals"
ADD CONSTRAINT "guardian_tracking_intervals_familyId_fkey"
FOREIGN KEY ("familyId") REFERENCES "families"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "guardian_tracking_intervals"
ADD CONSTRAINT "guardian_tracking_intervals_guardianUserId_fkey"
FOREIGN KEY ("guardianUserId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing true state remains usable, but only from this migration onward.
-- No pre-migration sharing history is inferred or exposed.
INSERT INTO "guardian_tracking_intervals" (
    "id",
    "familyId",
    "guardianUserId",
    "startedAt"
)
SELECT
    'bootstrap-' || "id",
    "familyId",
    "userId",
    CURRENT_TIMESTAMP
FROM "family_members"
WHERE "memberType" = 'guardian'
  AND "guardianTrackingEnabled" = true;
