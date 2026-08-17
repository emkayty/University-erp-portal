#!/usr/bin/env bash
# Apply the non-Prisma PostgreSQL baseline after `prisma db push`.
#
# Prisma owns tables and conventional indexes. This script owns PostgreSQL
# extensions, the restricted runtime role grants, and RLS policies because the
# historic SQL migrations are not usable as a fresh-database migration chain.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_DIR="${ROOT_DIR}/apps/api"

: "${MIGRATE_DATABASE_URL:?MIGRATE_DATABASE_URL must be an owner/admin PostgreSQL URL}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required for PostgreSQL extension and RLS baseline setup." >&2
  exit 1
fi

# Extensions must exist before Prisma creates vector-backed or crypto-defaulted
# columns. Re-running them is harmless.
psql "$MIGRATE_DATABASE_URL" --set=ON_ERROR_STOP=1 <<'SQL'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";
SQL

if [[ "${1:-prepare}" == "prepare" ]]; then
  exit 0
fi

if [[ "${1:-prepare}" != "harden" ]]; then
  echo "Usage: $0 [prepare|harden]" >&2
  exit 2
fi

if [[ "${RENDER_MANAGED_DB:-false}" == "true" ]]; then
  echo "Render managed database detected; skipping restricted-role checks and grants for test mode."
else
  for role in uniportal_app uniportal_system; do
    if ! psql "$MIGRATE_DATABASE_URL" --tuples-only --no-align --quiet \
      --command "SELECT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}');" | grep -qx 't'; then
      echo "Required database role '${role}' is missing. Run scripts/db/bootstrap-production-roles.sh first." >&2
      exit 2
    fi
  done

  # The role grants must be applied after db push, because that command creates
  # the tables as the owner/admin account.
  psql "$MIGRATE_DATABASE_URL" --set=ON_ERROR_STOP=1 <<'SQL'
GRANT USAGE ON SCHEMA public TO uniportal_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO uniportal_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO uniportal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO uniportal_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO uniportal_app;
SQL
fi

# Keep table-level RLS enabled in both production and Render test mode. The
# production role grants above are deliberately the only part skipped in test.
psql "$MIGRATE_DATABASE_URL" --set=ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;
ALTER TABLE course_registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE data_subject_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE security_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE graduation_candidates ENABLE ROW LEVEL SECURITY;
SQL

# Migration 0016 is a known-good normalization of the protected-table policies.
# Its policy name marks a database that has already received this baseline.
has_rls_baseline="$(psql "$MIGRATE_DATABASE_URL" --tuples-only --no-align --quiet \
  --command "SELECT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'students' AND policyname = 'student_read');")"

if [[ "$has_rls_baseline" != "t" ]]; then
  echo "Applying RLS policy baseline..."
  if [[ "${RENDER_MANAGED_DB:-false}" != "true" ]]; then
    psql "$MIGRATE_DATABASE_URL" --set=ON_ERROR_STOP=1 --file \
      "${API_DIR}/prisma/migrations/0011_p10_rls_role_separation/migration.sql"
  else
    echo "Render managed database detected; skipping historical role-creation migration."
  fi
  psql "$MIGRATE_DATABASE_URL" --set=ON_ERROR_STOP=1 --file \
    "${API_DIR}/prisma/migrations/0016_integrity_rls_academic_hardening/migration.sql"

  psql "$MIGRATE_DATABASE_URL" --set=ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE graduation_candidates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS graduation_candidate_read ON graduation_candidates;
DROP POLICY IF EXISTS graduation_candidate_insert ON graduation_candidates;
DROP POLICY IF EXISTS graduation_candidate_update ON graduation_candidates;
CREATE POLICY graduation_candidate_read ON graduation_candidates FOR SELECT USING (
  current_setting('app.current_role',true) IN ('SUPER_ADMIN','VC','REGISTRAR','DEAN')
  OR "studentId" IN (SELECT id FROM students WHERE "userId"::text=current_setting('app.current_user_id',true))
  OR (current_setting('app.current_role',true) IN ('HOD','DEAN') AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text=current_setting('app.current_dept_id',true)))
);
CREATE POLICY graduation_candidate_insert ON graduation_candidates FOR INSERT WITH CHECK (
  current_setting('app.current_role',true) IN ('SUPER_ADMIN','REGISTRAR','DEAN')
  OR (current_setting('app.current_role',true) IN ('HOD','DEAN') AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text=current_setting('app.current_dept_id',true)))
);
CREATE POLICY graduation_candidate_update ON graduation_candidates FOR UPDATE USING (
  current_setting('app.current_role',true) IN ('SUPER_ADMIN','VC','REGISTRAR','DEAN')
  OR (current_setting('app.current_role',true) IN ('HOD','DEAN') AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text=current_setting('app.current_dept_id',true)))
) WITH CHECK (
  current_setting('app.current_role',true) IN ('SUPER_ADMIN','VC','REGISTRAR','DEAN')
  OR (current_setting('app.current_role',true) IN ('HOD','DEAN') AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text=current_setting('app.current_dept_id',true)))
);
SQL
else
  echo "RLS policy baseline already present; retaining existing policy definitions."
fi
