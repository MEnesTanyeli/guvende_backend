CREATE TABLE "family_offline_sos_keys" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "publicKey" TEXT NOT NULL,
    "encryptedPrivateKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "retiredAt" TIMESTAMP(3),
    CONSTRAINT "family_offline_sos_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "offline_sos_device_keys" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "wrappingPublicKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    CONSTRAINT "offline_sos_device_keys_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "family_offline_sos_keys_familyId_version_key" ON "family_offline_sos_keys"("familyId", "version");
CREATE INDEX "family_offline_sos_keys_familyId_status_idx" ON "family_offline_sos_keys"("familyId", "status");
CREATE UNIQUE INDEX "offline_sos_device_keys_userId_deviceId_key" ON "offline_sos_device_keys"("userId", "deviceId");
CREATE INDEX "offline_sos_device_keys_userId_revokedAt_idx" ON "offline_sos_device_keys"("userId", "revokedAt");
CREATE UNIQUE INDEX "family_offline_sos_one_active_key" ON "family_offline_sos_keys"("familyId") WHERE "status" = 'active';

ALTER TABLE "family_offline_sos_keys" ADD CONSTRAINT "family_offline_sos_keys_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "families"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "offline_sos_device_keys" ADD CONSTRAINT "offline_sos_device_keys_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
