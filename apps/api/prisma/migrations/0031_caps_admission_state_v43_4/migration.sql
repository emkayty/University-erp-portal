-- V43.4: separate JAMB CAPS admission state from institutional ApplicantStatus
DO $$ BEGIN
  CREATE TYPE "CapsAdmissionStatus" AS ENUM (
    'NOT_APPLICABLE',
    'OPEN',
    'RECOMMENDED',
    'APPROVED',
    'CANDIDATE_ACCEPTED',
    'REJECTED',
    'WITHDRAWN',
    'SYNC_ERROR'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "applicants"
  ADD COLUMN IF NOT EXISTS "capsAdmissionStatus" "CapsAdmissionStatus" NOT NULL DEFAULT 'NOT_APPLICABLE',
  ADD COLUMN IF NOT EXISTS "capsApplicationReference" VARCHAR(100),
  ADD COLUMN IF NOT EXISTS "capsProgramme" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "capsInstitution" VARCHAR(200),
  ADD COLUMN IF NOT EXISTS "capsApprovedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "candidateAcceptedOnCapsAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastCapsSyncAt" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "idx_applicants_caps_status"
  ON "applicants"("capsAdmissionStatus", "admissionType");
