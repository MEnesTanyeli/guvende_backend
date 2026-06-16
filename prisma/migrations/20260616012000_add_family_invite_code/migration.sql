-- AlterTable
ALTER TABLE "families" ADD COLUMN "inviteCode" TEXT;

-- Backfill existing families with readable unique invite codes derived from UUIDs.
DO $$
DECLARE
  family_record RECORD;
  base_code TEXT;
  candidate_code TEXT;
  suffix_number INTEGER;
BEGIN
  FOR family_record IN SELECT "id" FROM "families" WHERE "inviteCode" IS NULL ORDER BY "createdAt", "id" LOOP
    base_code := upper(substr(replace(family_record."id", '-', ''), 1, 8));
    candidate_code := base_code;
    suffix_number := 0;

    WHILE EXISTS (
      SELECT 1
      FROM "families"
      WHERE "inviteCode" = candidate_code
        AND "id" <> family_record."id"
    ) LOOP
      suffix_number := suffix_number + 1;
      candidate_code := substr(base_code, 1, 6) || lpad(suffix_number::text, 2, '0');
    END LOOP;

    UPDATE "families"
    SET "inviteCode" = candidate_code
    WHERE "id" = family_record."id";
  END LOOP;
END $$;

-- CreateIndex
CREATE UNIQUE INDEX "families_inviteCode_key" ON "families"("inviteCode");
