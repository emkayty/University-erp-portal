-- V43.14: trace exam marks into the canonical AssessmentMark evidence stream.
-- Existing coursework marks remain valid because the provenance link is nullable.
ALTER TABLE "assessment_marks"
  ADD COLUMN "exam_timetable_id" UUID;

CREATE INDEX "idx_assessment_mark_exam_timetable"
  ON "assessment_marks"("exam_timetable_id");

ALTER TABLE "assessment_marks"
  ADD CONSTRAINT "assessment_marks_exam_timetable_id_fkey"
  FOREIGN KEY ("exam_timetable_id") REFERENCES "exam_timetables"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
