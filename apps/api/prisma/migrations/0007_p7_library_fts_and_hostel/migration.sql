-- Migration 0007: P7 — Library FTS index (deferred from 0002) + Hostel indexes
-- idx_library_items_fts was deferred from 0002 because library_items didn't exist yet.
--
-- AUDIT-M1 FIX: same issue as 0002 (see that file's header) — every column
-- reference below was originally unquoted snake_case against a schema with
-- no @map anywhere. Verified each field name directly against schema.prisma
-- (RoomAllocation, LibraryLoan, Staff, CourseOffering, SalaryGrade) before
-- fixing rather than guessing. Table names are untouched — @@map values are
-- already lowercase, so unquoted references to THOSE fold correctly; it is
-- only camelCase FIELD names that needed quoting.

CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Full-text search on library items (title + author)
CREATE INDEX IF NOT EXISTS idx_library_items_fts
  ON library_items USING GIN (
    to_tsvector('english', title || ' ' || COALESCE(author, ''))
  );

-- Trigram search for partial title/author matches
CREATE INDEX IF NOT EXISTS idx_library_items_title_trgm
  ON library_items USING GIN (title gin_trgm_ops);

-- Room allocation: partial index for active allocations only
CREATE INDEX IF NOT EXISTS idx_room_allocation_active
  ON room_allocations ("roomId", "academicYear")
  WHERE status = 'ACTIVE' AND "deletedAt" IS NULL;

-- Library loans: overdue sweep index
CREATE INDEX IF NOT EXISTS idx_loans_overdue_sweep
  ON library_loans ("dueDate")
  WHERE status = 'ACTIVE' AND "returnedAt" IS NULL AND "deletedAt" IS NULL;

-- ── B-P6-1: Payslip RLS identity fix ─────────────────────────────────────────
-- Migration 0002's payslip_own policy compared payslips.staffId to
-- app.current_user_id (users.id). staffId is a Staff record UUID;
-- current_user_id is a User record UUID — they never match.
-- Staff viewing their own payslip history received zero rows.
-- Fix: bridge staffId → staff.userId to reach the logged-in user.
--
-- NOTE: this policy is superseded by migration 0008, which rebuilds
-- `payslips` as a partitioned table (RENAME → recreate) and attaches its
-- own `staff_own_payslips` policy to the new table — this CREATE POLICY
-- still needs to be syntactically valid so migration history doesn't break
-- at THIS step, even though its effect is later replaced.
DROP POLICY IF EXISTS payslip_own ON payslips;
CREATE POLICY payslip_own ON payslips
  FOR SELECT
  USING (
    current_setting('app.current_role', TRUE) IN ('SUPER_ADMIN','BURSAR','HR_MANAGER')
    -- B-P6-1 fix: bridge staffId → staff.userId to match logged-in user
    OR "staffId" IN (
         SELECT id FROM staff
         WHERE "userId"::text = current_setting('app.current_user_id', TRUE)
       )
  );

-- ── H-P6-6: medical_records RLS (deferred from 0002) ─────────────────────────
-- Applied here now that medical_records table exists in P7 schema context.
-- (Note: medical_records physical table created in P8; this is a placeholder
-- that will be moved to P8 migration if needed)
-- ALTER TABLE medical_records ENABLE ROW LEVEL SECURITY; -- uncomment in P8

-- ── H-P6-7: Partial unique index for CourseOffering WHERE semesterId IS NOT NULL ──
-- @@unique([courseId, semesterId]) with nullable semesterId allows multiple offerings
-- for the same course when semesterId = NULL (PostgreSQL: NULL != NULL in unique indexes).
-- This partial index enforces uniqueness only for non-null semesterId values.
CREATE UNIQUE INDEX IF NOT EXISTS idx_course_offering_nn
  ON course_offerings ("courseId", "semesterId")
  WHERE "semesterId" IS NOT NULL;

-- ── M-P6-1: SalaryGrade per-step unique constraint ────────────────────────────
-- Previously: @unique on gradeLevel alone — could not model GL-07 Step 3 and GL-07 Step 9.
-- Now: @@unique([gradeLevel, step]) supports full step-based IPPIS salary matrix.
-- Add unique index (Prisma will generate @@unique([gradeLevel, step]) DDL in next migration)
CREATE UNIQUE INDEX IF NOT EXISTS uq_salary_grade_level_step
  ON salary_grades ("gradeLevel", step);
