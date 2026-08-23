#!/usr/bin/env bash
# Bootstrap least-privilege UniPortal database login roles through any reachable
# PostgreSQL endpoint. Run once after schema deployment with an administrator
# connection that is allowed to CREATE/ALTER roles and assign BYPASSRLS.
set -euo pipefail

POSTGRES_ADMIN_URL="${POSTGRES_ADMIN_URL:-${DATABASE_ADMIN_URL:-}}"
POSTGRES_DB_NAME="${POSTGRES_DB_NAME:-${DATABASE_NAME:-}}"
UNIPORTAL_APP_PASSWORD="${UNIPORTAL_APP_PASSWORD:-${DATABASE_APP_PASSWORD:-}}"
UNIPORTAL_SYSTEM_PASSWORD="${UNIPORTAL_SYSTEM_PASSWORD:-${DATABASE_SYSTEM_PASSWORD:-}}"
: "${POSTGRES_ADMIN_URL:?Set POSTGRES_ADMIN_URL or DATABASE_ADMIN_URL to an administrator PostgreSQL connection URL}"
: "${POSTGRES_DB_NAME:?Set POSTGRES_DB_NAME or DATABASE_NAME to the UniPortal database name}"
: "${UNIPORTAL_APP_PASSWORD:?Set UNIPORTAL_APP_PASSWORD or DATABASE_APP_PASSWORD from a secret manager}"
: "${UNIPORTAL_SYSTEM_PASSWORD:?Set UNIPORTAL_SYSTEM_PASSWORD or DATABASE_SYSTEM_PASSWORD from a secret manager}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required. Install a PostgreSQL client or run this script from a controlled CI/admin host." >&2
  exit 1
fi

psql "$POSTGRES_ADMIN_URL" \
  --set=ON_ERROR_STOP=1 \
  --set=app_password="$UNIPORTAL_APP_PASSWORD" \
  --set=system_password="$UNIPORTAL_SYSTEM_PASSWORD" \
  --set=database_name="$POSTGRES_DB_NAME" <<'SQL'
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uniportal_app') THEN
    CREATE ROLE uniportal_app LOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uniportal_system') THEN
    CREATE ROLE uniportal_system LOGIN;
  END IF;
END $$;

SELECT format('ALTER ROLE uniportal_app WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT', :'app_password') \gexec
SELECT format('ALTER ROLE uniportal_system WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS', :'system_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO uniportal_app', :'database_name') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO uniportal_system', :'database_name') \gexec

DO $$
DECLARE
  app_role record;
  system_role record;
BEGIN
  SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
    INTO app_role
    FROM pg_roles WHERE rolname = 'uniportal_app';
  SELECT rolcanlogin, rolsuper, rolcreatedb, rolcreaterole, rolinherit, rolbypassrls
    INTO system_role
    FROM pg_roles WHERE rolname = 'uniportal_system';

  IF app_role.rolcanlogin IS DISTINCT FROM true
     OR app_role.rolsuper IS DISTINCT FROM false
     OR app_role.rolcreatedb IS DISTINCT FROM false
     OR app_role.rolcreaterole IS DISTINCT FROM false
     OR app_role.rolinherit IS DISTINCT FROM false
     OR app_role.rolbypassrls IS DISTINCT FROM false
     OR NOT has_database_privilege('uniportal_app', current_database(), 'CONNECT') THEN
    RAISE EXCEPTION 'uniportal_app role contract verification failed';
  END IF;

  IF system_role.rolcanlogin IS DISTINCT FROM true
     OR system_role.rolsuper IS DISTINCT FROM false
     OR system_role.rolcreatedb IS DISTINCT FROM false
     OR system_role.rolcreaterole IS DISTINCT FROM false
     OR system_role.rolinherit IS DISTINCT FROM false
     OR system_role.rolbypassrls IS DISTINCT FROM true
     OR NOT has_database_privilege('uniportal_system', current_database(), 'CONNECT') THEN
    RAISE EXCEPTION 'uniportal_system role contract verification failed';
  END IF;
END $$;
SQL

echo "UniPortal production database roles are configured and verified for database '${POSTGRES_DB_NAME}'."
