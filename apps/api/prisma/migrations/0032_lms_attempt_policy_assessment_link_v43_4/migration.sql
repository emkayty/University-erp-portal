-- V43.4: LMS attempt history, availability policies, and assessment linkage
ALTER TABLE "course_contents"
  ADD COLUMN IF NOT EXISTS "availabilityStart" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "availabilityEnd" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "dueDate" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "allowLateSubmissions" BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS "latePenaltyPct" DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS "maxAttempts" SMALLINT,
  ADD COLUMN IF NOT EXISTS "assessmentComponentId" UUID;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_course_content_assessment_component"
  ON "course_contents"("assessmentComponentId");
ALTER TABLE "course_contents"
  ADD CONSTRAINT "course_contents_assessmentComponentId_fkey"
  FOREIGN KEY ("assessmentComponentId") REFERENCES "assessment_components"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "lms_submissions"
  DROP CONSTRAINT IF EXISTS "uq_lms_submission_content_student";
ALTER TABLE "lms_submissions"
  ADD COLUMN IF NOT EXISTS "attemptNumber" SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "submittedLate" BOOLEAN NOT NULL DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_lms_submission_content_student_attempt"
  ON "lms_submissions"("contentId", "studentId", "attemptNumber");
CREATE INDEX IF NOT EXISTS "idx_lms_submission_content_student_attempt"
  ON "lms_submissions"("contentId", "studentId", "attemptNumber" DESC);
