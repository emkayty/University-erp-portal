-- V43.5: make the ACCEPTED -> CLEARANCE -> MATRICULATED policy explicit
ALTER TABLE "institution_settings"
  ADD COLUMN IF NOT EXISTS "requireAdmissionClearance" BOOLEAN NOT NULL DEFAULT TRUE;
