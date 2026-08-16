-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0012: dedicated BYPASSRLS role for DirectPrismaService
-- (this-pass remediation, item P0-2 — see docs/CHANGELOG.md)
--
-- Migration 0011 correctly gave the request-scoped runtime connection
-- (`uniportal_app`, used by PrismaService / DATABASE_URL) NOSUPERUSER and
-- NOBYPASSRLS, closing the original "RLS is decorative" defect. But
-- .env.example, prior to this migration, pointed DATABASE_DIRECT_URL at
-- that SAME `uniportal_app` role. DATABASE_DIRECT_URL is what
-- DirectPrismaService uses — a second, separate PrismaClient connection
-- (see direct-prisma.service.ts) that exists specifically for advisory
-- locks and has no mechanism to ever carry the per-request
-- app.current_user_id / app.current_role / app.current_dept_id session
-- variables the RLS policies check, because it is not wired into
-- RlsContextService's AsyncLocalStorage at all — it is a wholly separate
-- client instance, typically used from a context (matric number
-- generation during admission processing) that has no single "current
-- user's visible rows" to scope to in the first place.
--
-- Concretely: MatricNumberService.generate() queries `students` (a FORCE
-- ROW LEVEL SECURITY table as of migration 0011) to find the highest
-- existing matric number for a department/year prefix, system-wide. Under
-- `uniportal_app` with no session variables ever set on this connection,
-- every RLS policy's `current_setting(..., TRUE)` call returns NULL, every
-- policy evaluates to NULL (=false) for every row, and the query returns
-- ZERO rows — meaning every new admission in a department/year would be
-- assigned sequence 00001, a guaranteed duplicate matric number, the
-- moment DATABASE_DIRECT_URL actually points at a non-superuser role.
--
-- Rather than teach this one query to fake a "current user" that doesn't
-- meaningfully exist for a system-level sequence generator, this migration
-- gives DirectPrismaService's connection its own role with BYPASSRLS —
-- scoped narrowly to the one documented, narrow purpose that class exists
-- for (see direct-prisma.service.ts's "WHEN TO USE" / "WHEN NOT TO USE").
-- BYPASSRLS is a deliberate, narrow exception for a connection nothing
-- else uses, not a general-purpose way around row-level security.
-- ═══════════════════════════════════════════════════════════════════════════════

-- No password set here deliberately, same reasoning as migration 0011 for
-- uniportal_app — set out-of-band via a secrets-managed step before
-- pointing DATABASE_DIRECT_URL at this role. See infra/README.md.
DO $$ BEGIN
  CREATE ROLE uniportal_system LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Same portability reasoning as migration 0011: GRANT CONNECT ON DATABASE
-- requires a literal database name and is run out-of-band per environment
-- (see infra/README.md, updated alongside this migration).
GRANT USAGE ON SCHEMA public TO uniportal_system;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO uniportal_system;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO uniportal_system;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO uniportal_system;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO uniportal_system;
