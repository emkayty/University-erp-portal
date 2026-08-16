-- V43.5: apply configured quiz attempt and deadline policy consistently
ALTER TABLE "quiz_attempts"
  ADD COLUMN IF NOT EXISTS "submittedLate" BOOLEAN NOT NULL DEFAULT FALSE;
