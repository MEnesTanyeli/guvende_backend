CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenFamilyId" TEXT NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "deviceId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "replacedByTokenHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sessions_refreshTokenHash_key" ON "sessions"("refreshTokenHash");
CREATE INDEX "sessions_userId_revokedAt_idx" ON "sessions"("userId", "revokedAt");
CREATE INDEX "sessions_userId_tokenFamilyId_revokedAt_idx" ON "sessions"("userId", "tokenFamilyId", "revokedAt");
CREATE INDEX "sessions_expiresAt_idx" ON "sessions"("expiresAt");

ALTER TABLE "sessions"
ADD CONSTRAINT "sessions_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
