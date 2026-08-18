CREATE TYPE "AccessibilitySupportStatus" AS ENUM ('REQUESTED', 'CONTACTED', 'ARRANGED', 'DECLINED', 'CLOSED');

CREATE TABLE "application_accessibility_support" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "applicationId" UUID NOT NULL,
  "requested" BOOLEAN NOT NULL DEFAULT false,
  "supportAreas" JSONB,
  "requestedAdjustments" JSONB,
  "supportDescriptionEncrypted" TEXT,
  "preferredContactMethod" VARCHAR(30),
  "preferredFormat" VARCHAR(40),
  "consentAccepted" BOOLEAN NOT NULL DEFAULT false,
  "consentVersion" VARCHAR(50),
  "consentAt" TIMESTAMPTZ,
  "status" "AccessibilitySupportStatus" NOT NULL DEFAULT 'REQUESTED',
  "assignedSupportOfficerId" UUID,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closedAt" TIMESTAMPTZ,
  CONSTRAINT "application_accessibility_support_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "application_accessibility_support_applicationId_key" UNIQUE ("applicationId"),
  CONSTRAINT "application_accessibility_support_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "application_accessibility_support_assignedSupportOfficerId_fkey" FOREIGN KEY ("assignedSupportOfficerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "idx_accessibility_support_status" ON "application_accessibility_support"("status", "createdAt");
