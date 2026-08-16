ALTER TABLE institution_settings
  ADD COLUMN IF NOT EXISTS assessment_final_exam_weight NUMERIC(5,2) NOT NULL DEFAULT 60.00,
  ADD COLUMN IF NOT EXISTS assessment_continuous_assessment_weight NUMERIC(5,2) NOT NULL DEFAULT 40.00,
  ADD COLUMN IF NOT EXISTS grade_policy_version SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS enable_live_gradebook BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS require_result_validation BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE student_results
  ADD COLUMN IF NOT EXISTS grading_system_snapshot VARCHAR(30) NOT NULL DEFAULT 'NIGERIAN_5_POINT',
  ADD COLUMN IF NOT EXISTS grading_policy_version SMALLINT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS final_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS result_version SMALLINT NOT NULL DEFAULT 1;

CREATE TABLE IF NOT EXISTS assessment_schemes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), course_offering_id UUID NOT NULL,
  name VARCHAR(150) NOT NULL, version SMALLINT NOT NULL DEFAULT 1,
  total_weight NUMERIC(5,2) NOT NULL DEFAULT 100, status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  approved_by_id UUID, approved_at TIMESTAMPTZ, effective_from TIMESTAMPTZ,
  created_by_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_assessment_scheme_version UNIQUE(course_offering_id, version)
);
CREATE INDEX IF NOT EXISTS idx_assessment_scheme_offering_status ON assessment_schemes(course_offering_id,status);

CREATE TABLE IF NOT EXISTS assessment_components (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), scheme_id UUID NOT NULL REFERENCES assessment_schemes(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL, code VARCHAR(30) NOT NULL, category VARCHAR(30) NOT NULL,
  max_score NUMERIC(6,2) NOT NULL, weight NUMERIC(5,2) NOT NULL, sequence SMALLINT NOT NULL DEFAULT 1,
  is_required BOOLEAN NOT NULL DEFAULT TRUE, is_published BOOLEAN NOT NULL DEFAULT FALSE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_assessment_component_code UNIQUE(scheme_id,code)
);
CREATE INDEX IF NOT EXISTS idx_assessment_component_order ON assessment_components(scheme_id,sequence);

CREATE TABLE IF NOT EXISTS assessment_marks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), student_id UUID NOT NULL, course_offering_id UUID NOT NULL,
  component_id UUID NOT NULL REFERENCES assessment_components(id) ON DELETE CASCADE, score NUMERIC(6,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT', entered_by_id UUID NOT NULL, finalized_by_id UUID, finalized_at TIMESTAMPTZ,
  version SMALLINT NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_assessment_mark_student_component UNIQUE(student_id,component_id)
);
CREATE INDEX IF NOT EXISTS idx_assessment_mark_offering_status ON assessment_marks(course_offering_id,status);
CREATE INDEX IF NOT EXISTS idx_assessment_mark_student_offering ON assessment_marks(student_id,course_offering_id);

CREATE TABLE IF NOT EXISTS exam_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), exam_timetable_id UUID NOT NULL, student_id UUID NOT NULL,
  eligibility VARCHAR(30) NOT NULL DEFAULT 'ELIGIBLE', reason TEXT, seat_label VARCHAR(30), generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_exam_candidate UNIQUE(exam_timetable_id,student_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_candidate_student ON exam_candidates(student_id,eligibility);

CREATE TABLE IF NOT EXISTS exam_invigilators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), exam_timetable_id UUID NOT NULL, staff_id UUID NOT NULL,
  role VARCHAR(30) NOT NULL DEFAULT 'INVIGILATOR', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_exam_invigilator UNIQUE(exam_timetable_id,staff_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_invigilator_staff ON exam_invigilators(staff_id);

CREATE TABLE IF NOT EXISTS exam_attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), exam_timetable_id UUID NOT NULL, student_id UUID NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PRESENT', checked_in_at TIMESTAMPTZ, checked_out_at TIMESTAMPTZ,
  booklet_number VARCHAR(50), incident_note TEXT, recorded_by_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_exam_attendance UNIQUE(exam_timetable_id,student_id)
);
CREATE INDEX IF NOT EXISTS idx_exam_attendance_exam_status ON exam_attendance(exam_timetable_id,status);

CREATE TABLE IF NOT EXISTS exam_venues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), code VARCHAR(30) UNIQUE NOT NULL, name VARCHAR(150) NOT NULL,
  campus VARCHAR(100), building VARCHAR(100), room VARCHAR(100), capacity SMALLINT NOT NULL,
  accessible BOOLEAN NOT NULL DEFAULT FALSE, active BOOLEAN NOT NULL DEFAULT TRUE, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_exam_venue_campus_active ON exam_venues(campus,active);

CREATE TABLE IF NOT EXISTS result_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), student_result_id UUID NOT NULL, version SMALLINT NOT NULL,
  score NUMERIC(5,2) NOT NULL, grade VARCHAR(2) NOT NULL, grade_point NUMERIC(3,1) NOT NULL,
  reason TEXT, changed_by_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_result_version UNIQUE(student_result_id,version)
);
CREATE INDEX IF NOT EXISTS idx_result_version_history ON result_versions(student_result_id,created_at);

CREATE TABLE IF NOT EXISTS grade_upload_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(), course_offering_id UUID NOT NULL, semester_id UUID NOT NULL, uploaded_by_id UUID NOT NULL,
  file_name VARCHAR(255) NOT NULL, template_version VARCHAR(30) NOT NULL, mode VARCHAR(30) NOT NULL DEFAULT 'VALIDATE_ONLY',
  status VARCHAR(30) NOT NULL DEFAULT 'VALIDATED', total_rows INT NOT NULL DEFAULT 0, valid_rows INT NOT NULL DEFAULT 0,
  warning_rows INT NOT NULL DEFAULT 0, error_rows INT NOT NULL DEFAULT 0, checksum VARCHAR(128), error_report JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_grade_upload_offering_date ON grade_upload_batches(course_offering_id,created_at);

ALTER TABLE assessment_components DROP CONSTRAINT IF EXISTS assessment_components_scheme_id_fkey;
ALTER TABLE assessment_components ADD CONSTRAINT assessment_components_scheme_id_fkey FOREIGN KEY (scheme_id) REFERENCES assessment_schemes(id) ON DELETE CASCADE;
ALTER TABLE assessment_marks DROP CONSTRAINT IF EXISTS assessment_marks_component_id_fkey;
ALTER TABLE assessment_marks ADD CONSTRAINT assessment_marks_component_id_fkey FOREIGN KEY (component_id) REFERENCES assessment_components(id) ON DELETE CASCADE;
