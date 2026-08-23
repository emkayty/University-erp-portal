#!/usr/bin/env bash
# Deploy UniPortal's Prisma schema for this release line.
#
# The historic SQL migration chain is not a fresh-database baseline: an early
# migration refers to relations introduced later. `prisma migrate deploy` is
# therefore unsafe for new environments. This script uses `db push` without
# --accept-data-loss and aborts if a schema change would be destructive.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
API_DIR="${ROOT_DIR}/apps/api"
PRISMA_BIN="${API_DIR}/node_modules/.bin/prisma"
HARDENING_SCRIPT="${ROOT_DIR}/scripts/db/apply-post-schema-hardening.sh"
ROLE_BOOTSTRAP_SCRIPT="${ROOT_DIR}/scripts/db/bootstrap-production-roles.sh"
FRESH_PARTITIONS_SQL="${ROOT_DIR}/scripts/db/apply-fresh-neon-partitions.sql"
FRESH_EXTRAS_SQL="${ROOT_DIR}/scripts/db/apply-fresh-neon-extras.sql"
source "${ROOT_DIR}/scripts/db/resolve-runtime-database-urls.sh"

: "${DATABASE_URL:?DATABASE_URL must be set for the runtime application connection}"
: "${MIGRATE_DATABASE_URL:?MIGRATE_DATABASE_URL must be set to an owner/admin connection for schema deployment}"

if [[ ! -x "${PRISMA_BIN}" ]]; then
  echo "Prisma CLI not found at ${PRISMA_BIN}. Install dependencies before running this script." >&2
  exit 1
fi

case "${SCHEMA_DEPLOYMENT_MODE:-push}" in
  push)
    if [[ "${DATABASE_AUTO_BOOTSTRAP_ROLES:-false}" == "true" && "${RENDER_MANAGED_DB:-false}" != "true" ]]; then
      echo "Bootstrapping restricted runtime database roles..."
      bash "${ROLE_BOOTSTRAP_SCRIPT}"
    elif [[ "${DATABASE_AUTO_BOOTSTRAP_ROLES:-false}" == "true" && "${RENDER_MANAGED_DB:-false}" == "true" ]]; then
      echo "Render managed database detected; skipping unsupported restricted-role bootstrap for test mode."
    fi
    echo "Preparing PostgreSQL extensions required by the Prisma schema..."
    bash "${HARDENING_SCRIPT}" prepare
    echo "Deploying Prisma schema with db push (non-destructive mode)..."
    DATABASE_URL="${MIGRATE_DATABASE_URL}" "${PRISMA_BIN}" db push --schema "${API_DIR}/prisma/schema.prisma" --skip-generate

    if [[ "${FRESH_NEON_BASELINE:-false}" == "true" ]]; then
      if [[ "${RENDER_MANAGED_DB:-false}" == "true" ]]; then
        echo "Refusing FRESH_NEON_BASELINE in Render managed test mode; use the controlled Neon migration host instead." >&2
        exit 2
      fi
      echo "Applying the complete fresh-Neon partition baseline..."
      payments_partitioned="$(psql "${MIGRATE_DATABASE_URL}" --tuples-only --no-align --quiet --command "SELECT EXISTS (SELECT 1 FROM pg_partitioned_table pt JOIN pg_class c ON c.oid = pt.partrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'payments');")"
      payslips_partitioned="$(psql "${MIGRATE_DATABASE_URL}" --tuples-only --no-align --quiet --command "SELECT EXISTS (SELECT 1 FROM pg_partitioned_table pt JOIN pg_class c ON c.oid = pt.partrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relname = 'payslips');")"
      if [[ "${payments_partitioned}" == "t" && "${payslips_partitioned}" == "t" ]]; then
        echo "Payment and payslip partitions already exist; skipping one-time conversion."
      elif [[ "${payments_partitioned}" == "f" && "${payslips_partitioned}" == "f" ]]; then
        psql "${MIGRATE_DATABASE_URL}" --set=ON_ERROR_STOP=1 --file "${FRESH_PARTITIONS_SQL}"
      else
        echo "Refusing partial partition baseline: payments=${payments_partitioned}, payslips=${payslips_partitioned}." >&2
        exit 2
      fi
      echo "Applying migration-only integrity checks, indexes, and triggers..."
      psql "${MIGRATE_DATABASE_URL}" --set=ON_ERROR_STOP=1 --file "${FRESH_EXTRAS_SQL}"
    fi

    echo "Applying the PostgreSQL role and RLS hardening baseline..."
    bash "${HARDENING_SCRIPT}" harden
    ;;
  migrate)
    echo "Refusing prisma migrate deploy: the committed migration chain is not a fresh-database baseline." >&2
    echo "Use SCHEMA_DEPLOYMENT_MODE=push, or add and validate a consolidated baseline migration first." >&2
    exit 2
    ;;
  *)
    echo "Unsupported SCHEMA_DEPLOYMENT_MODE='${SCHEMA_DEPLOYMENT_MODE}'. Use 'push'." >&2
    exit 2
    ;;
esac
