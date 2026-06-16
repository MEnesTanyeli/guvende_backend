-- AlterEnum
ALTER TYPE "AlertType" ADD VALUE 'medication_taken';

-- AlterTable
ALTER TABLE "families" ADD COLUMN "type" TEXT NOT NULL DEFAULT 'children';

-- AlterTable
ALTER TABLE "family_members" ADD COLUMN "muteNotifications" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users"
ADD COLUMN "emailChangeNewEmail" TEXT,
ADD COLUMN "emailChangeOtpCode" TEXT,
ADD COLUMN "emailChangeOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN "gender" TEXT,
ADD COLUMN "isPremium" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "premiumExpiresAt" TIMESTAMP(3),
ADD COLUMN "proxyId" TEXT,
ADD COLUMN "resetOtpCode" TEXT,
ADD COLUMN "resetOtpExpiresAt" TIMESTAMP(3),
ADD COLUMN "trialEndsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "role" SET DEFAULT 'guardian';

-- CreateTable
CREATE TABLE "medication_reminders" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "medicationName" TEXT NOT NULL,
    "dosage" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastTakenAt" TIMESTAMP(3),
    "reminderType" TEXT NOT NULL DEFAULT 'medication',
    "startDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "repeatDays" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "medication_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_usages" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageName" TEXT NOT NULL,
    "appName" TEXT NOT NULL,
    "durationMin" INTEGER NOT NULL,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordedDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_usages_userId_packageName_recordedDate_key"
ON "app_usages"("userId", "packageName", "recordedDate");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_proxyId_fkey"
FOREIGN KEY ("proxyId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medication_reminders" ADD CONSTRAINT "medication_reminders_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "app_usages" ADD CONSTRAINT "app_usages_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
