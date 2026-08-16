-- Migration 0004: P6 HR + deferred indexes from 0002
-- Applies staff/payslip GIN indexes now that staff table exists.
--
-- AUDIT-M1 FIX: column references quoted to camelCase — see migration 0002's
-- header comment for the full explanation (no @map anywhere in schema.prisma).

-- idx_staff_name_trgm: DEFERRED from 0002 (staff table created in P6)
CREATE INDEX IF NOT EXISTS idx_staff_name_trgm
  ON staff USING GIN (("firstName" || ' ' || "lastName") gin_trgm_ops);

-- Payslip covering index for payslip history queries
CREATE INDEX IF NOT EXISTS idx_payslip_staff_year
  ON payslips ("staffId", EXTRACT(YEAR FROM "createdAt")::int);

-- Ensure pg_trgm extension (may already exist from 0002)
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
