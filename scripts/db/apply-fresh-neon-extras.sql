-- UniPortal fresh-Neon supplemental baseline.
--
-- Prisma db push creates the current datamodel. This file restores the
-- migration-only database invariants that Prisma cannot express: checks,
-- partial indexes, authorization constraints, and integrity triggers.
-- It is intentionally idempotent and fails closed on invalid existing rows.
-- It does not create or change passwords for database roles.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

-- Manual/TSA/GIFMIS receipt claims remain unpartitioned so receipt references
-- are globally unique across all monthly payment partitions. Prisma owns the
-- current table shape; this block restores the migration-only FK and index
-- contract and fails closed if existing rows violate the FK.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'payment_receipt_claims'::regclass
      AND conname = 'payment_receipt_claims_student_fee_id_fkey'
  ) THEN
    ALTER TABLE "payment_receipt_claims"
      ADD CONSTRAINT "payment_receipt_claims_student_fee_id_fkey"
      FOREIGN KEY ("studentFeeId") REFERENCES "student_fees"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;
CREATE UNIQUE INDEX IF NOT EXISTS "payment_receipt_claims_receipt_reference_key"
  ON "payment_receipt_claims" ("receiptReference");
CREATE INDEX IF NOT EXISTS "idx_payment_receipt_claim_payment"
  ON "payment_receipt_claims" ("paymentId");

-- Authorization governance checks and indexes.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_roles_effective_window_check') THEN
    ALTER TABLE "user_roles"
      ADD CONSTRAINT "user_roles_effective_window_check"
      CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" > "effectiveFrom");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_delegations_window_check') THEN
    ALTER TABLE "role_delegations"
      ADD CONSTRAINT "role_delegations_window_check"
      CHECK ("endsAt" > "startsAt");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_delegations_no_self_check') THEN
    ALTER TABLE "role_delegations"
      ADD CONSTRAINT "role_delegations_no_self_check"
      CHECK ("delegatorId" <> "delegateeId");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'role_delegations_approval_check') THEN
    ALTER TABLE "role_delegations"
      ADD CONSTRAINT "role_delegations_approval_check"
      CHECK ("approvedBy" IS NULL OR "approvedBy" <> "delegateeId");
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "idx_user_roles_effective"
  ON "user_roles" ("userId", "effectiveFrom", "effectiveUntil", "revokedAt");
CREATE INDEX IF NOT EXISTS "idx_user_roles_role_effective"
  ON "user_roles" ("roleName", "effectiveFrom", "effectiveUntil", "revokedAt");
CREATE UNIQUE INDEX IF NOT EXISTS "role_conflict_rules_code_key"
  ON "role_conflict_rules" ("code");
CREATE UNIQUE INDEX IF NOT EXISTS "uq_role_conflict_pair"
  ON "role_conflict_rules" ("roleA", "roleB");
CREATE INDEX IF NOT EXISTS "idx_role_conflict_active"
  ON "role_conflict_rules" ("active");
CREATE INDEX IF NOT EXISTS "idx_role_delegations_delegatee_active"
  ON "role_delegations" ("delegateeId", "status", "startsAt", "endsAt");
CREATE INDEX IF NOT EXISTS "idx_role_delegations_delegator_active"
  ON "role_delegations" ("delegatorId", "status", "startsAt", "endsAt");

-- Academic lifecycle checks and governed partial uniqueness.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_course_equivalency_not_self') THEN
    ALTER TABLE "course_equivalencies"
      ADD CONSTRAINT "ck_course_equivalency_not_self"
      CHECK ("fromCourseId" <> "toCourseId");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_course_equivalency_direction') THEN
    ALTER TABLE "course_equivalencies"
      ADD CONSTRAINT "ck_course_equivalency_direction"
      CHECK ("direction" IN ('BIDIRECTIONAL','ONE_WAY'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_transfer_credit_positive') THEN
    ALTER TABLE "academic_transfer_credits"
      ADD CONSTRAINT "ck_transfer_credit_positive"
      CHECK ("creditUnits" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_academic_placement_level') THEN
    ALTER TABLE "academic_placements"
      ADD CONSTRAINT "ck_academic_placement_level"
      CHECK ("toLevel" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_academic_placement_status') THEN
    ALTER TABLE "academic_placements"
      ADD CONSTRAINT "ck_academic_placement_status"
      CHECK ("status" IN ('RECOMMENDED', 'APPROVED', 'REJECTED', 'APPLIED', 'REVOKED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_academic_placement_application') THEN
    ALTER TABLE "academic_placements"
      ADD CONSTRAINT "ck_academic_placement_application"
      CHECK (("status" <> 'APPLIED') OR ("appliedAt" IS NOT NULL AND "appliedById" IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_academic_substitution_status') THEN
    ALTER TABLE "academic_substitutions"
      ADD CONSTRAINT "ck_academic_substitution_status"
      CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_academic_interruption_dates') THEN
    ALTER TABLE "academic_interruptions"
      ADD CONSTRAINT "ck_academic_interruption_dates"
      CHECK ("endDate" IS NULL OR "endDate" >= "startDate");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_academic_policy_effective_range') THEN
    ALTER TABLE "academic_policy_versions"
      ADD CONSTRAINT "ck_academic_policy_effective_range"
      CHECK ("effectiveTo" IS NULL OR "effectiveTo" >= "effectiveFrom");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_academic_policy_scope_id') THEN
    ALTER TABLE "academic_policy_versions"
      ADD CONSTRAINT "ck_academic_policy_scope_id"
      CHECK (("scope" = 'INSTITUTION' AND "scopeId" IS NULL) OR ("scope" <> 'INSTITUTION' AND "scopeId" IS NOT NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'lms_progress_pct_check') THEN
    ALTER TABLE "lms_progress"
      ADD CONSTRAINT "lms_progress_pct_check"
      CHECK ("progressPct" >= 0 AND "progressPct" <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assessment_components_max_score_positive') THEN
    ALTER TABLE "assessment_components"
      ADD CONSTRAINT "assessment_components_max_score_positive"
      CHECK ("maxScore" > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assessment_components_weight_range') THEN
    ALTER TABLE "assessment_components"
      ADD CONSTRAINT "assessment_components_weight_range"
      CHECK ("weight" >= 0 AND "weight" <= 100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'assessment_marks_score_non_negative') THEN
    ALTER TABLE "assessment_marks"
      ADD CONSTRAINT "assessment_marks_score_non_negative"
      CHECK ("score" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'result_versions_score_non_negative') THEN
    ALTER TABLE "result_versions"
      ADD CONSTRAINT "result_versions_score_non_negative"
      CHECK ("score" >= 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'result_versions_grade_point_non_negative') THEN
    ALTER TABLE "result_versions"
      ADD CONSTRAINT "result_versions_grade_point_non_negative"
      CHECK ("gradePoint" >= 0);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "uq_academic_plan_one_active_per_student"
  ON "academic_plans" ("studentId") WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX IF NOT EXISTS "uq_curriculum_active_per_programme"
  ON "curriculum_versions" ("programmeId") WHERE "status" = 'ACTIVE';
CREATE INDEX IF NOT EXISTS "idx_academic_placement_student_status_date"
  ON "academic_placements" ("studentId", "status", "effectiveDate");
CREATE INDEX IF NOT EXISTS "idx_outbox_retry_queue"
  ON "domain_events" ("processedAt", "deadLetteredAt", "nextAttemptAt", "createdAt");
CREATE INDEX IF NOT EXISTS "idx_lms_submission_attachment"
  ON "lms_submissions" ("studentId", "attachmentKey");

-- Search and operational indexes deferred by the historical migration chain.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_single_active_calendar"
  ON "academic_calendars" ("isActive") WHERE "isActive" = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_single_current_semester"
  ON "semesters" ("isCurrent") WHERE "isCurrent" = TRUE;
CREATE UNIQUE INDEX IF NOT EXISTS "idx_course_offering_nn"
  ON "course_offerings" ("courseId", "semesterId") WHERE "semesterId" IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "uq_salary_grade_level_step"
  ON "salary_grades" ("gradeLevel", "step");
CREATE INDEX IF NOT EXISTS "idx_students_name_trgm"
  ON "students" USING GIN (("firstName" || ' ' || "lastName") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_staff_name_trgm"
  ON "staff" USING GIN (("firstName" || ' ' || "lastName") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_courses_fts"
  ON "courses" USING GIN (to_tsvector('english', "code" || ' ' || "title"));
CREATE INDEX IF NOT EXISTS "idx_library_items_fts"
  ON "library_items" USING GIN (to_tsvector('english', "title" || ' ' || COALESCE("author", '')));
CREATE INDEX IF NOT EXISTS "idx_library_items_title_trgm"
  ON "library_items" USING GIN ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "idx_room_allocation_active"
  ON "room_allocations" ("roomId", "academicYear")
  WHERE "status" = 'ACTIVE' AND "deletedAt" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_loans_overdue_sweep"
  ON "library_loans" ("dueDate")
  WHERE "status" = 'ACTIVE' AND "returnedAt" IS NULL AND "deletedAt" IS NULL;

-- Migration-only integrity triggers. These are intentionally recreated so the
-- definitions converge on the current release even if older definitions exist.
CREATE OR REPLACE FUNCTION sync_course_offering_legacy_semester() RETURNS trigger AS $$
BEGIN
  SELECT CASE s."semesterNumber"
    WHEN 1 THEN 'FIRST'::"SemesterTerm"
    WHEN 2 THEN 'SECOND'::"SemesterTerm"
    WHEN 3 THEN 'SUMMER'::"SemesterTerm"
    ELSE NULL
  END
  INTO NEW."semester"
  FROM "semesters" s
  WHERE s."id" = NEW."semesterId";
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_course_offering_legacy_semester ON "course_offerings";
CREATE TRIGGER trg_course_offering_legacy_semester
  BEFORE INSERT OR UPDATE OF "semesterId" ON "course_offerings"
  FOR EACH ROW EXECUTE FUNCTION sync_course_offering_legacy_semester();

CREATE OR REPLACE FUNCTION validate_assessment_mark_context() RETURNS trigger AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "assessment_components" ac
    JOIN "assessment_schemes" s ON s."id" = ac."schemeId"
    WHERE ac."id" = NEW."componentId"
      AND s."courseOfferingId" = NEW."courseOfferingId"
  ) THEN
    RAISE EXCEPTION 'Assessment mark component does not belong to the supplied course offering';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_assessment_mark_context ON "assessment_marks";
CREATE TRIGGER trg_validate_assessment_mark_context
  BEFORE INSERT OR UPDATE OF "componentId", "courseOfferingId" ON "assessment_marks"
  FOR EACH ROW EXECUTE FUNCTION validate_assessment_mark_context();

CREATE OR REPLACE FUNCTION validate_grade_upload_context() RETURNS trigger AS $$
DECLARE offering_semester uuid;
BEGIN
  SELECT "semesterId" INTO offering_semester
  FROM "course_offerings"
  WHERE "id" = NEW."courseOfferingId";
  IF offering_semester IS NULL OR offering_semester <> NEW."semesterId" THEN
    RAISE EXCEPTION 'Grade upload semester does not match course offering semester';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_grade_upload_context ON "grade_upload_batches";
CREATE TRIGGER trg_validate_grade_upload_context
  BEFORE INSERT OR UPDATE OF "courseOfferingId", "semesterId" ON "grade_upload_batches"
  FOR EACH ROW EXECUTE FUNCTION validate_grade_upload_context();
