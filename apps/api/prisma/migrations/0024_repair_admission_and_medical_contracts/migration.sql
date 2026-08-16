-- Repair pass: align Prisma schema with existing admissions and clinic service behavior.

ALTER TABLE "admission_requirements"
  ADD COLUMN IF NOT EXISTS "requiredDocuments" JSONB;

-- The patient_id column already exists on medical_records; this index supports
-- the restored Prisma relation and common patient-history lookups.
CREATE INDEX IF NOT EXISTS "idx_medical_records_patient"
  ON "medical_records" ("patientId");
