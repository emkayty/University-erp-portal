#!/usr/bin/env bash
set -euo pipefail

: "${NODE_ENV:=production}"
: "${PROCESS_ROLE:=api}"
export NODE_ENV PROCESS_ROLE
source /app/scripts/db/resolve-runtime-database-urls.sh

if [[ "${RUN_DB_SCHEMA:-false}" == "true" ]]; then
  /app/scripts/db/deploy-schema.sh
fi

# Render Free does not provide a Pre-Deploy Command. For temporary test
# initialization, RUN_DB_SEED=true runs the idempotent Prisma seed after the
# schema is ready and before the API accepts traffic. Keep this disabled after
# the first successful test seed. Do not log the password.
if [[ "${RUN_DB_SEED:-false}" == "true" ]]; then
  # Render Free cannot complete the full reference-data seed within its
  # memory limit. In the managed staging test environment, default to the
  # explicit lightweight administrator refresh unless a future deployment
  # deliberately overrides it with SEED_ADMIN_ONLY=false.
  if [[ "${RENDER_MANAGED_DB:-false}" == "true" && "${NODE_ENV:-}" == "staging" ]]; then
    : "${SEED_ADMIN_ONLY:=true}"
    export SEED_ADMIN_ONLY
  fi

  if [[ -z "${SEED_ADMIN_EMAIL:-}" || -z "${SEED_ADMIN_PASSWORD:-}" ]]; then
    echo "RUN_DB_SEED=true requires SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD" >&2
    exit 1
  fi
  echo "Running temporary UniPortal test seed for administrator ${SEED_ADMIN_EMAIL}"
  export PATH="/app/apps/api/node_modules/.bin:/app/node_modules/.bin:${PATH}"
  (cd /app/apps/api && /app/apps/api/node_modules/.bin/prisma db seed)
fi

exec node /app/apps/api/dist/apps/api/src/main.js
