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
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
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

# Notification tables are created by the Prisma schema rather than the historic
# migration chain. Keep their request-identity policies in this supported
# post-schema hardening path as well as in migration 0052, so db-push and
# migration-based environments receive the same isolation contract.
psql "$MIGRATE_DATABASE_URL" --set=ON_ERROR_STOP=1 <<'SQL'
DROP POLICY IF EXISTS "notification_owner" ON "Notification";
DROP POLICY IF EXISTS "notification_preference_owner" ON "NotificationPreference";
CREATE POLICY "notification_owner" ON "Notification"
  USING ("userId" = current_setting('app.current_user_id', true));
CREATE POLICY "notification_preference_owner" ON "NotificationPreference"
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));
SQL

# Academic evidence cluster: protect degree-audit, plan, progression, standing,
# and placement records with the same request identity used by protected student
# records. DELETE is intentionally not granted so historical academic decisions
# cannot be removed through the application role.
psql "$MIGRATE_DATABASE_URL" --set=ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE academic_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_plan_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE degree_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE progression_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_standings ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_placements ENABLE ROW LEVEL SECURITY;

ALTER TABLE academic_plans FORCE ROW LEVEL SECURITY;
ALTER TABLE academic_plan_items FORCE ROW LEVEL SECURITY;
ALTER TABLE degree_audits FORCE ROW LEVEL SECURITY;
ALTER TABLE progression_evaluations FORCE ROW LEVEL SECURITY;
ALTER TABLE academic_standings FORCE ROW LEVEL SECURITY;
ALTER TABLE academic_placements FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS academic_plan_read ON academic_plans;
DROP POLICY IF EXISTS academic_plan_insert ON academic_plans;
DROP POLICY IF EXISTS academic_plan_update ON academic_plans;
CREATE POLICY academic_plan_read ON academic_plans FOR SELECT USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR')
  OR "studentId"::text = current_setting('app.current_user_id', true)
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN')
      AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text = current_setting('app.current_dept_id', true)))
);
CREATE POLICY academic_plan_insert ON academic_plans FOR INSERT WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN')
      AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text = current_setting('app.current_dept_id', true)))
);
CREATE POLICY academic_plan_update ON academic_plans FOR UPDATE USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN')
      AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text = current_setting('app.current_dept_id', true)))
) WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN')
      AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text = current_setting('app.current_dept_id', true)))
);

DROP POLICY IF EXISTS academic_plan_item_read ON academic_plan_items;
DROP POLICY IF EXISTS academic_plan_item_insert ON academic_plan_items;
DROP POLICY IF EXISTS academic_plan_item_update ON academic_plan_items;
CREATE POLICY academic_plan_item_read ON academic_plan_items FOR SELECT USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR')
  OR "planId" IN (SELECT p.id FROM academic_plans p WHERE p."studentId"::text = current_setting('app.current_user_id', true))
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN') AND "planId" IN (
    SELECT p.id FROM academic_plans p JOIN students s ON s.id = p."studentId"
    WHERE s."departmentId"::text = current_setting('app.current_dept_id', true)
  ))
);
CREATE POLICY academic_plan_item_insert ON academic_plan_items FOR INSERT WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN') AND "planId" IN (
    SELECT p.id FROM academic_plans p JOIN students s ON s.id = p."studentId"
    WHERE s."departmentId"::text = current_setting('app.current_dept_id', true)
  ))
);
CREATE POLICY academic_plan_item_update ON academic_plan_items FOR UPDATE USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN') AND "planId" IN (
    SELECT p.id FROM academic_plans p JOIN students s ON s.id = p."studentId"
    WHERE s."departmentId"::text = current_setting('app.current_dept_id', true)
  ))
) WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN') AND "planId" IN (
    SELECT p.id FROM academic_plans p JOIN students s ON s.id = p."studentId"
    WHERE s."departmentId"::text = current_setting('app.current_dept_id', true)
  ))
);

DROP POLICY IF EXISTS degree_audit_read ON degree_audits;
DROP POLICY IF EXISTS degree_audit_insert ON degree_audits;
CREATE POLICY degree_audit_read ON degree_audits FOR SELECT USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR')
  OR "studentId"::text = current_setting('app.current_user_id', true)
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN')
      AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text = current_setting('app.current_dept_id', true)))
);
CREATE POLICY degree_audit_insert ON degree_audits FOR INSERT WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN')
      AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text = current_setting('app.current_dept_id', true)))
);

DROP POLICY IF EXISTS progression_evaluation_read ON progression_evaluations;
DROP POLICY IF EXISTS progression_evaluation_insert ON progression_evaluations;
CREATE POLICY progression_evaluation_read ON progression_evaluations FOR SELECT USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR')
  OR "studentId"::text = current_setting('app.current_user_id', true)
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN')
      AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text = current_setting('app.current_dept_id', true)))
);
CREATE POLICY progression_evaluation_insert ON progression_evaluations FOR INSERT WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN')
      AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text = current_setting('app.current_dept_id', true)))
);

DROP POLICY IF EXISTS academic_standing_read ON academic_standings;
DROP POLICY IF EXISTS academic_standing_insert ON academic_standings;
CREATE POLICY academic_standing_read ON academic_standings FOR SELECT USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR')
  OR "studentId"::text = current_setting('app.current_user_id', true)
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN')
      AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text = current_setting('app.current_dept_id', true)))
);
CREATE POLICY academic_standing_insert ON academic_standings FOR INSERT WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN')
      AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text = current_setting('app.current_dept_id', true)))
);

DROP POLICY IF EXISTS academic_placement_read ON academic_placements;
DROP POLICY IF EXISTS academic_placement_insert ON academic_placements;
DROP POLICY IF EXISTS academic_placement_update ON academic_placements;
CREATE POLICY academic_placement_read ON academic_placements FOR SELECT USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR')
  OR "studentId"::text = current_setting('app.current_user_id', true)
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN')
      AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text = current_setting('app.current_dept_id', true)))
);
CREATE POLICY academic_placement_insert ON academic_placements FOR INSERT WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR')
  OR (current_setting('app.current_role', true) IN ('HOD','DEAN')
      AND "studentId" IN (SELECT s.id FROM students s WHERE s."departmentId"::text = current_setting('app.current_dept_id', true)))
);
CREATE POLICY academic_placement_update ON academic_placements FOR UPDATE USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR')
) WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR')
);
SQL

# Graduation-policy versions are governed records: readable by academic officers,
# draftable by Registrar/Dean/Super Admin, and activatable only by the VC,
# Registrar, or Super Admin. DELETE remains unavailable to preserve history.
psql "$MIGRATE_DATABASE_URL" --set=ON_ERROR_STOP=1 <<'SQL'
ALTER TABLE academic_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE academic_policy_versions FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS academic_policy_version_read ON academic_policy_versions;
DROP POLICY IF EXISTS academic_policy_version_insert ON academic_policy_versions;
DROP POLICY IF EXISTS academic_policy_version_update ON academic_policy_versions;
CREATE POLICY academic_policy_version_read ON academic_policy_versions FOR SELECT USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR','DEAN')
);
CREATE POLICY academic_policy_version_insert ON academic_policy_versions FOR INSERT WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','REGISTRAR','DEAN')
);
CREATE POLICY academic_policy_version_update ON academic_policy_versions FOR UPDATE USING (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR')
) WITH CHECK (
  current_setting('app.current_role', true) IN ('SUPER_ADMIN','VC','REGISTRAR')
);
SQL
