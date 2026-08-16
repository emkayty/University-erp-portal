-- V43.5: make registration fee-clearance semantics explicit
DO $$
BEGIN
  CREATE TYPE "FeeClearancePolicy" AS ENUM ('SEMESTER_REQUIRED', 'ANNUAL_CLEARANCE', 'NO_FINANCIAL_GATE');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "institution_settings"
  ADD COLUMN IF NOT EXISTS "feeClearancePolicy" "FeeClearancePolicy" NOT NULL DEFAULT 'SEMESTER_REQUIRED';
