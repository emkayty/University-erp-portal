-- V43.4: semester-specific fee clearance
ALTER TABLE "student_fees"
  ADD COLUMN IF NOT EXISTS "semesterId" UUID;

ALTER TABLE "student_fees"
  ADD CONSTRAINT "student_fees_semesterId_fkey"
  FOREIGN KEY ("semesterId") REFERENCES "semesters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "idx_student_fee_semester_status"
  ON "student_fees"("studentId", "semesterId", "status");
