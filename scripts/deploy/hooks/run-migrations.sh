#!/bin/bash
# Runs against MIGRATE_DATABASE_URL (bypasses PgBouncer) — required for DDL.
# The current release line uses the repository's controlled non-destructive
# schema deployment and PostgreSQL hardening workflow rather than the historic
# Prisma migration chain, which is not a fresh-database baseline.
set -euo pipefail
cd /opt/uniportal/current
set -a; source /opt/uniportal/.env.production; set +a
corepack enable
pnpm install --frozen-lockfile --ignore-scripts
pnpm db:generate
: "${MIGRATE_DATABASE_URL:?MIGRATE_DATABASE_URL is required for schema deployment}"
export SCHEMA_DEPLOYMENT_MODE="${SCHEMA_DEPLOYMENT_MODE:-push}"
export DATABASE_AUTO_BOOTSTRAP_ROLES="${DATABASE_AUTO_BOOTSTRAP_ROLES:-false}"
bash /opt/uniportal/current/scripts/db/deploy-schema.sh
