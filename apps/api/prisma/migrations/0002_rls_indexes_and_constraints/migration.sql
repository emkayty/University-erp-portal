-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0002: RLS Policies + Critical Indexes
-- C7 FIX: Calendar partial unique index (prevents concurrent activation race)
-- C8 FIX: PostgreSQL Row-Level Security policies for all user-data tables
-- Run AFTER Prisma creates tables via 0001 migration.
-- Uses DATABASE_DIRECT_URL (bypasses PgBouncer — DDL requires session connection).
--
-- AUDIT-M1 FIX: every column reference below was originally written
-- unquoted-snake_case (first_name, department_id, student_id, ...). Nothing
-- in schema.prisma uses @map on any field, so Prisma generates real Postgres
-- columns as quoted camelCase ("firstName", "departmentId", "studentId",
-- ...) — verified directly against schema.prisma before making this fix,
-- not assumed. As originally written, every CREATE INDEX and RLS policy
-- below would have targeted columns that don't exist and failed outright at
-- `prisma migrate deploy` time. Index/constraint NAME strings (e.g.
-- idx_students_name_trgm) are just labels, not column references, and are
-- left unchanged — only actual column identifiers are quoted here.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Extensions (idempotent) ───────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";  -- pgvector for AI/ML features (Phase 3+)

-- ── C7: Calendar unique active constraint ──────────────────────────────────────
-- Prevents the TOCTOU race condition where two concurrent requests both pass
-- the app-layer check and both activate calendars simultaneously.
CREATE UNIQUE INDEX IF NOT EXISTS uq_single_active_calendar
  ON academic_calendars ("isActive")
  WHERE "isActive" = TRUE;

-- ── GIN indexes for full-text search (pg_trgm) ────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_students_name_trgm
  ON students USING GIN (("firstName" || ' ' || "lastName") gin_trgm_ops);

-- idx_staff_name_trgm: DEFERRED to P6 migration (staff table created in P6 HR module)

-- idx_library_items_fts: DEFERRED to P7 migration (library_items table created in P7 library module)

CREATE INDEX IF NOT EXISTS idx_courses_fts
  ON courses USING GIN (
    to_tsvector('english', code || ' ' || title)
  );

-- ── C8: Enable RLS on all user-data tables ────────────────────────────────────
ALTER TABLE students           ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_results    ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments           ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips           ENABLE ROW LEVEL SECURITY;
-- medical_records RLS: DEFERRED to P8 migration (table created in P8 medical module)
-- H-P6-6 fix: enabling RLS on non-existent table causes prisma migrate deploy to fail on fresh DB
ALTER TABLE course_registrations ENABLE ROW LEVEL SECURITY;

-- ── C8: RLS Policies ──────────────────────────────────────────────────────────
-- STUDENTS table
DROP POLICY IF EXISTS student_own_record ON students;
CREATE POLICY student_own_record ON students
  FOR SELECT
  USING (
    current_setting('app.current_role', TRUE) = 'SUPER_ADMIN'
    OR "id"::text = current_setting('app.current_user_id', TRUE)
    OR current_setting('app.current_role', TRUE) IN ('REGISTRAR','VC','BURSAR','HR_MANAGER')
    OR (
      current_setting('app.current_role', TRUE) IN ('HOD','DEAN')
      AND "departmentId"::text = current_setting('app.current_dept_id', TRUE)
    )
  );

-- STUDENT_RESULTS table
DROP POLICY IF EXISTS result_visibility ON student_results;
CREATE POLICY result_visibility ON student_results
  FOR SELECT
  USING (
    current_setting('app.current_role', TRUE) = 'SUPER_ADMIN'
    OR current_setting('app.current_role', TRUE) IN ('REGISTRAR','VC')
    OR "studentId"::text = current_setting('app.current_user_id', TRUE)
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

-- PAYMENTS table — students see only own payments
DROP POLICY IF EXISTS payment_own ON payments;
CREATE POLICY payment_own ON payments
  FOR SELECT
  USING (
    current_setting('app.current_role', TRUE) IN ('SUPER_ADMIN','BURSAR','REGISTRAR')
    OR "studentId"::text = current_setting('app.current_user_id', TRUE)
  );

-- PAYSLIPS table — staff see only own payslips
DROP POLICY IF EXISTS payslip_own ON payslips;
CREATE POLICY payslip_own ON payslips
  FOR SELECT
  USING (
    current_setting('app.current_role', TRUE) IN ('SUPER_ADMIN','BURSAR','HR_MANAGER')
    OR "staffId"::text = current_setting('app.current_user_id', TRUE)
  );

-- medical_record_access policy: DEFERRED to P8 migration — H-P6-6 fix

-- COURSE_REGISTRATIONS — student owns + admin roles
DROP POLICY IF EXISTS creg_access ON course_registrations;
CREATE POLICY creg_access ON course_registrations
  FOR SELECT
  USING (
    current_setting('app.current_role', TRUE) IN ('SUPER_ADMIN','REGISTRAR','HOD','DEAN')
    OR "studentId"::text = current_setting('app.current_user_id', TRUE)
  );

-- ── Application PostgreSQL roles ───────────────────────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_student')  THEN CREATE ROLE app_student;  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_staff')    THEN CREATE ROLE app_staff;    END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_hod')      THEN CREATE ROLE app_hod;      END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_lecturer') THEN CREATE ROLE app_lecturer; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_clinic')   THEN CREATE ROLE app_clinic;   END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_admin')    THEN CREATE ROLE app_admin;    END IF;
END $$;
