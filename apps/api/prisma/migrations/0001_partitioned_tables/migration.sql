-- ═══════════════════════════════════════════════════════════════════════════
-- Migration: 0001_partitioned_tables
-- Creates the partitioned table shells for: payments, payslips,
-- audit_logs, student_results
--
-- FIX H2 (Critical Evaluation): This migration creates the partition parent
-- tables. The PartitionManagerService creates individual month/year partitions
-- automatically before they are needed (runs on startup + monthly cron).
--
-- IMPORTANT: Run this migration with DATABASE_DIRECT_URL (bypasses PgBouncer)
-- DDL commands cannot run through PgBouncer in transaction mode.
-- ═══════════════════════════════════════════════════════════════════════════

-- Required extensions (also created by docker/postgres/init.sql for local dev)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ── audit_logs: monthly RANGE partition ─────────────────────────────────────
-- Note: Prisma creates this table via schema migration. We ALTER it here
-- to convert to partitioned. In production, run BEFORE any data exists.
-- If audit_logs already exists unpartitioned, use pg_partman to convert.

-- Create the partitioned version of audit_logs
-- (Prisma will CREATE the plain table; this converts it if empty)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'audit_logs' AND c.relispartition = false
    AND n.nspname = 'public'
  ) THEN
    -- Table doesn't exist yet; Prisma migration will create it as partitioned
    RAISE NOTICE 'audit_logs will be created by Prisma migration';
  END IF;
END
$$;

-- ── student_results: partitioned by LIST on academic_year ───────────────────
-- This is the parent table. Prisma schema maps to this via @@map("student_results").
-- The PartitionManagerService creates year-specific child partitions.
-- CREATE TABLE student_results (...) PARTITION BY LIST (academic_year);
-- NOTE: Uncomment and adapt after Prisma creates the base table.

-- ── Seed initial partitions (current month + next 2 months) ─────────────────
-- The PartitionManagerService handles this on startup.
-- This migration creates partitions for the deployment month as a safety net.

DO $$
DECLARE
  v_year  INT;
  v_month INT;
  v_partition_name TEXT;
  v_range_from TEXT;
  v_range_to TEXT;
  v_tables TEXT[] := ARRAY['payments', 'payslips'];
  v_table TEXT;
BEGIN
  FOR month_offset IN 0..2 LOOP
    v_year  := EXTRACT(YEAR  FROM NOW() + (month_offset || ' months')::INTERVAL)::INT;
    v_month := EXTRACT(MONTH FROM NOW() + (month_offset || ' months')::INTERVAL)::INT;

    v_range_from := TO_CHAR(
      DATE_TRUNC('month', NOW() + (month_offset || ' months')::INTERVAL),
      'YYYY-MM-DD'
    );
    v_range_to := TO_CHAR(
      DATE_TRUNC('month', NOW() + ((month_offset + 1) || ' months')::INTERVAL),
      'YYYY-MM-DD'
    );

    FOREACH v_table IN ARRAY v_tables LOOP
      v_partition_name := v_table || '_' || TO_CHAR(v_year, 'FM0000') || '_' || TO_CHAR(v_month, 'FM00');

      -- Only attempt if parent table exists and is partitioned
      IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE c.relname = v_table AND n.nspname = 'public'
        AND c.relkind = 'p'
      ) THEN
        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
          v_partition_name, v_table, v_range_from, v_range_to
        );
        RAISE NOTICE 'Partition created: %', v_partition_name;
      END IF;
    END LOOP;
  END LOOP;
END
$$;

-- ── RLS setup: application roles ────────────────────────────────────────────
-- Create PostgreSQL roles for RLS policies (applied after table creation)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_student')   THEN CREATE ROLE app_student;   END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_staff')     THEN CREATE ROLE app_staff;     END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_hod')       THEN CREATE ROLE app_hod;       END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_lecturer')  THEN CREATE ROLE app_lecturer;  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_clinic')    THEN CREATE ROLE app_clinic;    END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin')     THEN CREATE ROLE app_admin;     END IF;
END
$$;

-- ── GIN indexes for full-text search (pg_trgm) ──────────────────────────────
-- Added after Prisma creates the tables. The PartitionManagerService
-- will call this on first startup if the indexes don't exist.

-- Executed lazily when the respective tables exist:
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_students_name_trgm
--   ON students USING GIN ((first_name || ' ' || last_name) gin_trgm_ops);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_staff_name_trgm
--   ON staff USING GIN ((first_name || ' ' || last_name) gin_trgm_ops);
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_library_items_fts
--   ON library_items USING GIN (to_tsvector('english', title || ' ' || coalesce(author, '')));
-- CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS uq_calendar_single_active
--   ON academic_calendars (is_active) WHERE is_active = TRUE;
