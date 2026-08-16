-- V43.4: authoritative CourseOffering lifecycle
DO $$ BEGIN
  CREATE TYPE "CourseOfferingLifecycle" AS ENUM (
    'PLANNED',
    'PUBLISHED',
    'REGISTRATION_OPEN',
    'REGISTRATION_CLOSED',
    'TEACHING',
    'ASSESSMENT',
    'EXAMINATION',
    'GRADING',
    'RESULTS_PENDING',
    'RESULTS_PUBLISHED',
    'COMPLETED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "course_offerings"
  ADD COLUMN IF NOT EXISTS "lifecycleStatus" "CourseOfferingLifecycle" NOT NULL DEFAULT 'PLANNED';

-- Preserve the pre-lifecycle meaning of the legacy isActive flag for existing data.
UPDATE "course_offerings"
SET "lifecycleStatus" = CASE WHEN "isActive" THEN 'REGISTRATION_OPEN'::"CourseOfferingLifecycle" ELSE 'CANCELLED'::"CourseOfferingLifecycle" END
WHERE "lifecycleStatus" = 'PLANNED'::"CourseOfferingLifecycle";

CREATE INDEX IF NOT EXISTS "idx_course_offerings_lifecycle"
  ON "course_offerings"("lifecycleStatus", "semesterId");
