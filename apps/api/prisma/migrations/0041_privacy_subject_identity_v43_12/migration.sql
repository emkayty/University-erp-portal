-- V43.12: privacy subject identity and durable erasure safety.
-- Keep the historical User link when available, but do not make a deletable
-- login account the only durable identity for a compliance record.
ALTER TABLE "data_subject_requests"
  ADD COLUMN "subjectPersonId" uuid;

ALTER TABLE "data_subject_requests"
  ALTER COLUMN "subjectUserId" DROP NOT NULL;

ALTER TABLE "data_subject_requests"
  DROP CONSTRAINT IF EXISTS "data_subject_requests_subjectUserId_fkey";

ALTER TABLE "data_subject_requests"
  ADD CONSTRAINT "data_subject_requests_subjectUserId_fkey"
  FOREIGN KEY ("subjectUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "data_subject_requests"
  ADD CONSTRAINT "data_subject_requests_subjectPersonId_fkey"
  FOREIGN KEY ("subjectPersonId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "idx_dsr_subject_person" ON "data_subject_requests"("subjectPersonId", "type");

ALTER TYPE "DsrRequestStatus" ADD VALUE IF NOT EXISTS 'IDENTITY_VERIFICATION_REQUIRED';
ALTER TYPE "DsrRequestStatus" ADD VALUE IF NOT EXISTS 'VERIFIED';
ALTER TYPE "DsrRequestStatus" ADD VALUE IF NOT EXISTS 'PARTIALLY_COMPLETED';
ALTER TYPE "DsrRequestStatus" ADD VALUE IF NOT EXISTS 'LEGAL_HOLD';
ALTER TYPE "DsrRequestStatus" ADD VALUE IF NOT EXISTS 'FAILED';
