#!/usr/bin/env bash
set -euo pipefail

: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD is required}"
: "${POSTGRES_SYSTEM_PASSWORD:?POSTGRES_SYSTEM_PASSWORD is required}"

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  --set=ON_ERROR_STOP=1 \
  --set=app_password="$POSTGRES_APP_PASSWORD" \
  --set=system_password="$POSTGRES_SYSTEM_PASSWORD" <<'SQL'
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "vector";

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uniportal_app') THEN
    CREATE ROLE uniportal_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'uniportal_system') THEN
    CREATE ROLE uniportal_system LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT BYPASSRLS;
  END IF;
END $$;

SELECT format('ALTER ROLE uniportal_app WITH PASSWORD %L', :'app_password') \gexec
SELECT format('ALTER ROLE uniportal_system WITH PASSWORD %L', :'system_password') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO uniportal_app', current_database()) \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO uniportal_system', current_database()) \gexec
SQL
