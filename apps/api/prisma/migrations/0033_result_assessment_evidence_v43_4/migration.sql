-- V43.4: preserve the assessment evidence used to generate each result
ALTER TABLE "student_results"
  ADD COLUMN IF NOT EXISTS "assessmentEvidence" JSONB;
