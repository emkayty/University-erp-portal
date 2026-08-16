#!/usr/bin/env bash
set -euo pipefail

: "${NODE_ENV:=production}"
: "${PROCESS_ROLE:=api}"
export NODE_ENV PROCESS_ROLE
source /app/scripts/db/resolve-runtime-database-urls.sh

if [[ "${RUN_DB_SCHEMA:-false}" == "true" ]]; then
  /app/scripts/db/deploy-schema.sh
fi

exec node /app/apps/api/dist/apps/api/src/main.js
