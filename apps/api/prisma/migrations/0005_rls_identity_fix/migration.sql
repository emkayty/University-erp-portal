-- Migration 0005: Fix RLS policy identity confusion (B2 evaluation finding)
--
-- PROBLEM: Migration 0002 compared students.id to app.current_user_id.
-- students.id is the Student record UUID.
-- app.current_user_id (from JwtPayload.sub) is the User record UUID.
-- These are independent auto-generated UUIDs and NEVER match.
-- Students were getting 0 rows for every self-query through RLS.
--
-- FIX: Compare students."userId" to app.current_user_id.
-- For related tables (student_results, payments, course_registrations)
-- use a subquery to bridge students."userId" → students."id".
--
-- AUDIT-M1 FIX: column references quoted to camelCase — see migration
-- 0002's header comment for the full explanation.

-- ── STUDENTS table — fix: "userId" not "id" ──────────────────────────────────
DROP POLICY IF EXISTS student_own_record ON students;
CREATE POLICY student_own_record ON students
  FOR SELECT
  USING (
    current_setting('app.current_role', TRUE) = 'SUPER_ADMIN'
    OR "userId"::text = current_setting('app.current_user_id', TRUE)  -- B2 fix
    OR current_setting('app.current_role', TRUE) IN ('REGISTRAR','VC','BURSAR','HR_MANAGER')
    OR (
      current_setting('app.current_role', TRUE) IN ('HOD','DEAN')
      AND "departmentId"::text = current_setting('app.current_dept_id', TRUE)
    )
  );

-- ── STUDENT_RESULTS table — fix: bridge via students."userId" ────────────────
DROP POLICY IF EXISTS result_visibility ON student_results;
CREATE POLICY result_visibility ON student_results
  FOR SELECT
  USING (
    current_setting('app.current_role', TRUE) = 'SUPER_ADMIN'
    OR current_setting('app.current_role', TRUE) IN ('REGISTRAR','VC')
    -- B2 fix: "studentId" → students."id"; bridge via "userId" to get the logged-in user's student
    OR "studentId" IN (
         SELECT "id" FROM students
         WHERE "userId"::text = current_setting('app.current_user_id', TRUE)
       )
    OR (
      current_setting('app.current_role', TRUE) = 'HOD'
      AND EXISTS (
        SELECT 1 FROM course_offerings co
        JOIN courses c ON c."id" = co."courseId"
        WHERE co."id" = student_results."courseOfferingId"
          AND c."departmentId"::text = current_setting('app.current_dept_id', TRUE)
      )
    )
  );

-- ── PAYMENTS table — fix: bridge via students."userId" ───────────────────────
DROP POLICY IF EXISTS payment_own ON payments;
CREATE POLICY payment_own ON payments
  FOR SELECT
  USING (
    current_setting('app.current_role', TRUE) IN ('SUPER_ADMIN','BURSAR','REGISTRAR')
    -- B2 fix: bridge "studentId" → students."id" → users."id"
    OR "studentId" IN (
         SELECT "id" FROM students
         WHERE "userId"::text = current_setting('app.current_user_id', TRUE)
       )
  );

-- ── COURSE_REGISTRATIONS — fix same pattern ───────────────────────────────────
DROP POLICY IF EXISTS creg_access ON course_registrations;
CREATE POLICY creg_access ON course_registrations
  FOR SELECT
  USING (
    current_setting('app.current_role', TRUE) IN ('SUPER_ADMIN','REGISTRAR','HOD','DEAN')
    OR "studentId" IN (
         SELECT "id" FROM students
         WHERE "userId"::text = current_setting('app.current_user_id', TRUE)
       )
  );
