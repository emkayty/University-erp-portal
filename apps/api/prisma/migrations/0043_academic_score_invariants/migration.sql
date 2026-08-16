-- Academic integrity hardening: protect every write path, not only DTO/service callers.
-- NOT VALID allows an existing installation to be diagnosed and remediated before
-- validation, while PostgreSQL still enforces each constraint for new rows.
ALTER TABLE assessment_components
  ADD CONSTRAINT assessment_components_max_score_positive
  CHECK (max_score > 0) NOT VALID;

ALTER TABLE assessment_components
  ADD CONSTRAINT assessment_components_weight_range
  CHECK (weight >= 0 AND weight <= 100) NOT VALID;

ALTER TABLE assessment_marks
  ADD CONSTRAINT assessment_marks_score_non_negative
  CHECK (score >= 0) NOT VALID;

ALTER TABLE result_versions
  ADD CONSTRAINT result_versions_score_non_negative
  CHECK (score >= 0) NOT VALID;

ALTER TABLE result_versions
  ADD CONSTRAINT result_versions_grade_point_non_negative
  CHECK (grade_point >= 0) NOT VALID;
