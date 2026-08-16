-- V43.5: optionally scope an offering to a specific curriculum version
ALTER TABLE "course_offerings"
  ADD COLUMN IF NOT EXISTS "curriculumVersionId" UUID;

ALTER TABLE "course_offerings"
  ADD CONSTRAINT "course_offerings_curriculumVersionId_fkey"
  FOREIGN KEY ("curriculumVersionId") REFERENCES "curriculum_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_offering_curriculum_semester"
  ON "course_offerings"("curriculumVersionId", "semesterId");
