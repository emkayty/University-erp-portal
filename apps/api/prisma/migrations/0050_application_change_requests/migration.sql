CREATE TYPE "ApplicationChangeRequestType" AS ENUM ('CORRECTION', 'WITHDRAWAL');
CREATE TYPE "ApplicationChangeRequestStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'COMPLETED');

CREATE TABLE "application_change_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "applicationId" UUID NOT NULL,
  "requestType" "ApplicationChangeRequestType" NOT NULL,
  "reasonEncrypted" TEXT NOT NULL,
  "requestedChangesEncrypted" TEXT,
  "status" "ApplicationChangeRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reviewedById" UUID,
  "reviewNoteEncrypted" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  CONSTRAINT "application_change_requests_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "application_change_requests_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "application_change_requests_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_application_change_request_status" ON "application_change_requests"("applicationId", "status");
