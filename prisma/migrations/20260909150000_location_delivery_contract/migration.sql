ALTER TABLE "locations"
  ADD COLUMN "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "devicePointId" TEXT,
  ADD COLUMN "filterVersion" TEXT NOT NULL DEFAULT 'legacy-client',
  ADD COLUMN "deliveryMode" TEXT NOT NULL DEFAULT 'live',
  ADD COLUMN "deferredReason" TEXT;

CREATE UNIQUE INDEX "locations_userId_devicePointId_key"
  ON "locations"("userId", "devicePointId");
