-- V43.7: approved admission-clearance changes become effective at the declared time
ALTER TABLE "institution_settings"
  ADD COLUMN IF NOT EXISTS "pendingAdmissionClearance" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "pendingAdmissionClearanceEffectiveAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "pendingAdmissionClearanceApprovalRef" VARCHAR(255);

CREATE INDEX IF NOT EXISTS "idx_institution_settings_pending_clearance"
  ON "institution_settings"("pendingAdmissionClearanceEffectiveAt");
