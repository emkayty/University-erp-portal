-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0011: RLS role separation (audit remediation R2)
--
-- Migration 0009's header comment documented the actual state honestly:
-- "the application DB user is the table owner, and Postgres exempts table
-- owners from RLS by default, so these policies are currently inert."
-- That's the root cause, and this migration is the fix for it — NOT the
-- app-layer wiring, which is separate (see RlsInterceptor +
-- RlsContextService in apps/api/src/common/rls/, and
-- docs/CHANGELOG.md item R2 for what's wired up so far vs. what
-- still needs each service migrated).
--
-- Two things were both true and both had to be fixed together, or neither
-- matters:
--   1. No request path set the app.current_* session variables (app-layer
--      gap — fixed by RlsInterceptor/RlsContextService, not by this file).
--   2. Even if (1) is fixed, the connection those variables are set on
--      still bypasses every policy, because docker-compose.yml sets
--      POSTGRES_USER=uniportal, which the official postgres image treats
--      as the cluster's bootstrap superuser — and Postgres RLS explicitly
--      does not apply to superusers, `FORCE ROW LEVEL SECURITY` included.
--      Fixing (1) alone would have been silent no-op security theater.
--
-- This migration creates a genuinely restricted, non-superuser,
-- non-owner role for the application's RUNTIME connection. Migrations
-- (DDL) continue to run as the existing owner/superuser role — that's a
-- deliberate, normal split (see infra/README.md and .env.example, updated
-- alongside this migration).
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. Runtime application role ─────────────────────────────────────────────
-- No password set here deliberately — do not commit credentials to a
-- migration file. Set it out-of-band via a secrets-managed step
-- (Terraform/IAM in infra/, or `ALTER ROLE uniportal_app WITH PASSWORD
-- '...'` run by an operator) before pointing DATABASE_URL at this role.
DO $$ BEGIN
  CREATE ROLE uniportal_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- GRANT CONNECT ON DATABASE <name> TO uniportal_app; is deliberately NOT
-- run here — a migration must be portable across the differently-named
-- uniportal_dev / uniportal_test / staging / prod databases, and
-- `GRANT ... ON DATABASE` requires a literal identifier, not an
-- expression. Run it once per environment as part of provisioning (see
-- infra/README.md, updated alongside this migration, for the exact
-- command per environment).
GRANT USAGE ON SCHEMA public TO uniportal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO uniportal_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO uniportal_app;

-- So tables created by FUTURE migrations (still run as the owner role) are
-- automatically visible to uniportal_app without a manual GRANT each time.
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO uniportal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO uniportal_app;

-- ── 2. FORCE row-level security on every table with existing policies ──────
-- Belt-and-braces: uniportal_app does not own these tables, so plain
-- ENABLE (already set by migrations 0002/0008/0009) is sufficient on its
-- own. FORCE is added anyway so these tables stay protected even if
-- ownership is ever changed or a future migration runs `ALTER TABLE ...
-- OWNER TO uniportal_app` by mistake.
ALTER TABLE "students"                FORCE ROW LEVEL SECURITY;
ALTER TABLE "student_results"         FORCE ROW LEVEL SECURITY;
ALTER TABLE "payments"                FORCE ROW LEVEL SECURITY;
ALTER TABLE "payslips"                FORCE ROW LEVEL SECURITY;
ALTER TABLE "course_registrations"    FORCE ROW LEVEL SECURITY;
ALTER TABLE "data_subject_requests"   FORCE ROW LEVEL SECURITY;
ALTER TABLE "security_incidents"      FORCE ROW LEVEL SECURITY;

-- ── 3. Remove unused per-role scaffolding ───────────────────────────────────
-- app_student/app_staff/app_hod/app_lecturer/app_clinic were created in
-- docker/postgres/init.sql, granted no privileges, and referenced nowhere
-- outside migrations 0001/0002 (which only used them in commented-out or
-- superseded statements). The actually-implemented design distinguishes
-- roles via the `app.current_role` SESSION VARIABLE read inside each
-- policy (see 0002/0005/0007/0008/0009), not via separate Postgres
-- connection roles per application role. Keeping five unused roles around
-- implies a design that was never built and invites someone to wire them
-- up incorrectly later. Dropped here; if genuinely separate connection
-- roles per application role are wanted in future, design and grant them
-- deliberately rather than resurrecting these placeholders.
DROP ROLE IF EXISTS app_student;
DROP ROLE IF EXISTS app_staff;
DROP ROLE IF EXISTS app_hod;
DROP ROLE IF EXISTS app_lecturer;
DROP ROLE IF EXISTS app_clinic;
