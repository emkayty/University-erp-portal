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
  if [[ -z "${SEED_ADMIN_EMAIL:-}" || -z "${SEED_ADMIN_PASSWORD:-}" ]]; then
    echo "RUN_DB_SEED=true requires SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD" >&2
    exit 1
  fi
  echo "Running temporary UniPortal test seed for administrator ${SEED_ADMIN_EMAIL}"
  (cd /app/apps/api && /app/apps/api/node_modules/.bin/prisma db seed)
fi

exec node /app/apps/api/dist/apps/api/src/main.js
