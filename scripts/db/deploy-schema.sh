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
