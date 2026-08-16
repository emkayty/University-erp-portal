#!/bin/bash
# scripts/db/bootstrap-local-roles.sh
#
# P0-3 FIX (this pass — see docs/CHANGELOG.md): migrations 0011/0012
# CREATE the uniportal_app and uniportal_system roles, but deliberately don't
# set a password or GRANT CONNECT — that's out-of-band by design (see both
# migrations' header comments), so credentials are never committed to a SQL
# file under version control. In a real deployment that's a Secrets-Manager
# step (see infra/README.md). Locally, nothing ever did that step, which
# means a fresh clone following the documented Quick Start — clone, cp
# .env.example .env, docker-compose up, pnpm db:migrate:dev, pnpm dev — got a
# working schema and a running migration, then a database authentication
# failure the first time the API tried to query anything, because
# uniportal_app/uniportal_system have no valid password at all.
#
# This script closes that gap for local development ONLY: it sets both
# roles' passwords to match the CHANGE_ME placeholder already in
# apps/api/.env.example (or to $LOCAL_DB_PASSWORD if you've changed .env to
# something else) and grants CONNECT, against the docker-compose Postgres
# container. Safe to re-run — every statement is idempotent.
#
# Usage:  pnpm db:bootstrap-roles
#         LOCAL_DB_PASSWORD=something-else pnpm db:bootstrap-roles
set -euo pipefail

CONTAINER="${POSTGRES_CONTAINER:-uniportal_postgres}"
DB_NAME="${POSTGRES_DB:-uniportal_dev}"
SUPERUSER="${POSTGRES_SUPERUSER:-uniportal}"
PASSWORD="${LOCAL_DB_PASSWORD:-CHANGE_ME}"

if ! docker ps --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  echo "❌ Container '$CONTAINER' is not running. Start it first: docker-compose up -d postgres" >&2
  exit 1
fi

echo "Setting up uniportal_app / uniportal_system for local development against '$CONTAINER'..."

docker exec -i "$CONTAINER" psql -U "$SUPERUSER" -d "$DB_NAME" <<SQL
DO \$\$ BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'uniportal_app') THEN
    RAISE EXCEPTION 'Role uniportal_app does not exist yet — run migrations first (pnpm db:migrate:dev).';
  END IF;
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'uniportal_system') THEN
    RAISE EXCEPTION 'Role uniportal_system does not exist yet — run migrations first (pnpm db:migrate:dev).';
  END IF;
END \$\$;

ALTER ROLE uniportal_app WITH PASSWORD '$PASSWORD';
ALTER ROLE uniportal_system WITH PASSWORD '$PASSWORD';
GRANT CONNECT ON DATABASE $DB_NAME TO uniportal_app;
GRANT CONNECT ON DATABASE $DB_NAME TO uniportal_system;
SQL

echo "✅ uniportal_app and uniportal_system are configured for local development on '$DB_NAME'."
echo "   If apps/api/.env uses a different password for these roles, re-run with:"
echo "     LOCAL_DB_PASSWORD=<your-password> pnpm db:bootstrap-roles"
