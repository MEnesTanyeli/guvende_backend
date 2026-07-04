CREATE TABLE "admin_audit_logs" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_logs_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "admin_audit_logs"
ADD CONSTRAINT "admin_audit_logs_adminId_fkey"
FOREIGN KEY ("adminId") REFERENCES "users"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
