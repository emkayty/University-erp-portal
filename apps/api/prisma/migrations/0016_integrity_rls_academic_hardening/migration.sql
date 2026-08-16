-- 0016: Production integrity hardening
--
-- Goals:
-- 1. Make the RLS model complete for protected tables (read + controlled writes).
-- 2. Canonicalize repeat-attempt ordering with StudentResult.attempt_number.
-- 3. Make academic history a true semester snapshot.
-- 4. Preserve safe operation for existing deployments through nullable/backfill-safe changes.

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1) Canonical result attempt number
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE student_results
  ADD COLUMN IF NOT EXISTS "attemptNumber" SMALLINT NOT NULL DEFAULT 1;

-- Existing rows receive deterministic numbering by student + canonical course,
-- ordered by original creation time and id. Re-running is harmless because the
-- migration only applies the row-number calculation to the current values.
WITH ranked AS (
  SELECT sr.id,
         ROW_NUMBER() OVER (
           PARTITION BY sr."studentId", co."courseId"
           ORDER BY sr."createdAt" ASC, sr.id ASC
         )::smallint AS attempt_no
  FROM student_results sr
  JOIN course_offerings co ON co.id = sr."courseOfferingId"
)
UPDATE student_results sr
SET "attemptNumber" = ranked.attempt_no
FROM ranked
WHERE sr.id = ranked.id;

CREATE INDEX IF NOT EXISTS idx_result_student_attempt
  ON student_results ("studentId", "attemptNumber");

ALTER TABLE student_results
  ADD CONSTRAINT ck_student_result_attempt_number_positive
  CHECK ("attemptNumber" >= 1);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2) Semester-level academic history
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE student_academic_history
  ADD COLUMN IF NOT EXISTS "semesterId" UUID NULL;

ALTER TABLE student_academic_history
  ADD COLUMN IF NOT EXISTS "periodKey" VARCHAR(100);

UPDATE student_academic_history
SET "periodKey" = COALESCE("periodKey", CONCAT('legacy:', id::text))
WHERE "periodKey" IS NULL;

ALTER TABLE student_academic_history
  ALTER COLUMN "periodKey" SET NOT NULL;

-- Historical rows created before this migration cannot be safely assigned to a
-- semester because the old table did not store one. They remain NULL and are
-- retained for historical reporting. All new application writes use semesterId.
ALTER TABLE student_academic_history
  DROP CONSTRAINT IF EXISTS uq_student_academic_history;

CREATE UNIQUE INDEX IF NOT EXISTS uq_student_academic_history_period
  ON student_academic_history ("studentId", "periodKey");

ALTER TABLE student_academic_history
  DROP CONSTRAINT IF EXISTS student_academic_history_semesterId_fkey;
ALTER TABLE student_academic_history
  ADD CONSTRAINT student_academic_history_semesterId_fkey
  FOREIGN KEY ("semesterId") REFERENCES semesters(id) ON DELETE SET NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3) RLS policy normalization
--
-- Remove superseded duplicate policies first. A table with FORCE RLS must have
-- explicit write policy coverage; otherwise legitimate application writes are
-- rejected by PostgreSQL. DELETE remains intentionally denied on immutable /
-- academic-history-sensitive tables unless a future policy explicitly grants it.
-- ─────────────────────────────────────────────────────────────────────────────

-- students
DROP POLICY IF EXISTS student_own_record ON students;
DROP POLICY IF EXISTS student_self_read ON students;
CREATE POLICY student_read ON students FOR SELECT USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR','BURSAR','HR_MANAGER')
  OR "userId"::text = current_setting('app.current_user_id', true)
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN')
      AND "departmentId"::text = current_setting('app.current_dept_id', true))
);
CREATE POLICY student_insert_admin ON students FOR INSERT WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR')
);
CREATE POLICY student_update_admin ON students FOR UPDATE USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN') AND "departmentId"::text = current_setting('app.current_dept_id', true))
) WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN') AND "departmentId"::text = current_setting('app.current_dept_id', true))
);

-- student_results
DROP POLICY IF EXISTS result_visibility ON student_results;
DROP POLICY IF EXISTS student_result_write ON student_results;
CREATE POLICY result_read ON student_results FOR SELECT USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR')
  OR "studentId" IN (SELECT id FROM students WHERE "userId"::text = current_setting('app.current_user_id', true))
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN') AND EXISTS (
      SELECT 1 FROM course_offerings co JOIN courses c ON c.id = co."courseId"
      WHERE co.id = student_results."courseOfferingId"
        AND c."departmentId"::text = current_setting('app.current_dept_id', true)
  ))
  OR (current_setting('app.current_role', true) = 'STAFF' AND EXISTS (
      SELECT 1 FROM course_offerings co JOIN staff st ON st.id = co."lecturerId"
      WHERE co.id = student_results."courseOfferingId"
        AND st."userId"::text = current_setting('app.current_user_id', true)
  ))
);
CREATE POLICY result_insert ON student_results FOR INSERT WITH CHECK (
  current_setting('app.current_role', true) IN ('REGISTRAR','SUPER_ADMIN')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN') AND EXISTS (
      SELECT 1 FROM course_offerings co JOIN courses c ON c.id = co."courseId"
      WHERE co.id = "courseOfferingId" AND c."departmentId"::text = current_setting('app.current_dept_id', true)
  ))
  OR (current_setting('app.current_role', true) = 'STAFF' AND EXISTS (
      SELECT 1 FROM course_offerings co JOIN staff st ON st.id = co."lecturerId"
      WHERE co.id = "courseOfferingId"
        AND st."userId"::text = current_setting('app.current_user_id', true)
  ))
);
CREATE POLICY result_update ON student_results FOR UPDATE USING (
  current_setting('app.current_role', true) IN ('REGISTRAR','VC','SUPER_ADMIN')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN') AND EXISTS (
      SELECT 1 FROM course_offerings co JOIN courses c ON c.id = co."courseId"
      WHERE co.id = student_results."courseOfferingId" AND c."departmentId"::text = current_setting('app.current_dept_id', true)
  ))
  OR (current_setting('app.current_role', true) = 'STAFF' AND "status" IN ('DRAFT','REJECTED') AND EXISTS (
      SELECT 1 FROM course_offerings co JOIN staff st ON st.id = co."lecturerId"
      WHERE co.id = student_results."courseOfferingId"
        AND st."userId"::text = current_setting('app.current_user_id', true)
  ))
) WITH CHECK (
  current_setting('app.current_role', true) IN ('REGISTRAR','VC','SUPER_ADMIN')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN') AND EXISTS (
      SELECT 1 FROM course_offerings co JOIN courses c ON c.id = co."courseId"
      WHERE co.id = "courseOfferingId" AND c."departmentId"::text = current_setting('app.current_dept_id', true)
  ))
  OR (current_setting('app.current_role', true) = 'STAFF' AND "status" IN ('DRAFT','REJECTED') AND EXISTS (
      SELECT 1 FROM course_offerings co JOIN staff st ON st.id = co."lecturerId"
      WHERE co.id = "courseOfferingId"
        AND st."userId"::text = current_setting('app.current_user_id', true)
  ))
);

-- course registrations
DROP POLICY IF EXISTS creg_access ON course_registrations;
DROP POLICY IF EXISTS course_registration_write ON course_registrations;
CREATE POLICY creg_read ON course_registrations FOR SELECT USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN') AND EXISTS (
      SELECT 1 FROM course_offerings co JOIN courses c ON c.id = co."courseId"
      WHERE co.id = course_registrations."courseOfferingId" AND c."departmentId"::text = current_setting('app.current_dept_id', true)
  ))
  OR "studentId" IN (SELECT id FROM students WHERE "userId"::text = current_setting('app.current_user_id', true))
  OR (current_setting('app.current_role', true) = 'STAFF' AND EXISTS (
      SELECT 1 FROM course_offerings co JOIN staff st ON st.id = co."lecturerId"
      WHERE co.id = course_registrations."courseOfferingId"
        AND st."userId"::text = current_setting('app.current_user_id', true)
  ))
);
CREATE POLICY creg_insert ON course_registrations FOR INSERT WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN') AND EXISTS (
      SELECT 1 FROM course_offerings co JOIN courses c ON c.id = co."courseId"
      WHERE co.id = "courseOfferingId" AND c."departmentId"::text = current_setting('app.current_dept_id', true)
  ))
  OR (current_setting('app.current_role', true) = 'STUDENT' AND "studentId" IN (
      SELECT id FROM students WHERE "userId"::text = current_setting('app.current_user_id', true)
  ))
);
CREATE POLICY creg_update ON course_registrations FOR UPDATE USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN') AND EXISTS (
      SELECT 1 FROM course_offerings co JOIN courses c ON c.id = co."courseId"
      WHERE co.id = course_registrations."courseOfferingId" AND c."departmentId"::text = current_setting('app.current_dept_id', true)
  ))
) WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN') AND EXISTS (
      SELECT 1 FROM course_offerings co JOIN courses c ON c.id = co."courseId"
      WHERE co.id = "courseOfferingId" AND c."departmentId"::text = current_setting('app.current_dept_id', true)
  ))
);

-- payments
DROP POLICY IF EXISTS payment_own ON payments;
DROP POLICY IF EXISTS student_own_payments ON payments;
CREATE POLICY payment_read ON payments FOR SELECT USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','BURSAR','REGISTRAR')
  OR "studentId" IN (SELECT id FROM students WHERE "userId"::text = current_setting('app.current_user_id', true))
);
CREATE POLICY payment_insert ON payments FOR INSERT WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','BURSAR','REGISTRAR')
  OR (current_setting('app.current_role', true) = 'STUDENT' AND "studentId" IN (
      SELECT id FROM students WHERE "userId"::text = current_setting('app.current_user_id', true)
  ))
);
CREATE POLICY payment_update ON payments FOR UPDATE USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','BURSAR','REGISTRAR')
) WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','BURSAR','REGISTRAR')
);

-- payslips: employees may read their own; payroll roles manage them.
DROP POLICY IF EXISTS payslip_own ON payslips;
DROP POLICY IF EXISTS staff_own_payslips ON payslips;
CREATE POLICY payslip_read ON payslips FOR SELECT USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','HR_MANAGER','BURSAR')
  OR "staffId" IN (SELECT id FROM staff WHERE "userId"::text = current_setting('app.current_user_id', true))
);
CREATE POLICY payslip_manage ON payslips FOR INSERT WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','HR_MANAGER','BURSAR')
);
CREATE POLICY payslip_update ON payslips FOR UPDATE USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','HR_MANAGER','BURSAR')
) WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','HR_MANAGER','BURSAR')
);

-- NDPR data-subject requests
DROP POLICY IF EXISTS dsr_visibility ON data_subject_requests;
CREATE POLICY dsr_read ON data_subject_requests FOR SELECT USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR')
  OR "subjectUserId"::text = current_setting('app.current_user_id', true)
  OR "requestedById"::text = current_setting('app.current_user_id', true)
);
CREATE POLICY dsr_insert ON data_subject_requests FOR INSERT WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR')
  OR "subjectUserId"::text = current_setting('app.current_user_id', true)
);
CREATE POLICY dsr_update ON data_subject_requests FOR UPDATE USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR')
) WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR')
);

-- Security incidents are restricted operational data.
DROP POLICY IF EXISTS incident_visibility ON security_incidents;
CREATE POLICY incident_read ON security_incidents FOR SELECT USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR','HR_MANAGER')
);
CREATE POLICY incident_insert ON security_incidents FOR INSERT WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR','HR_MANAGER','SUPPORT_STAFF')
);
CREATE POLICY incident_update ON security_incidents FOR UPDATE USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR','HR_MANAGER')
) WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR','HR_MANAGER')
);

COMMIT;
