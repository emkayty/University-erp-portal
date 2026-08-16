#!/usr/bin/env bash
set -euo pipefail

: "${NODE_ENV:=production}"
export NODE_ENV
export PROCESS_ROLE=worker
source /app/scripts/db/resolve-runtime-database-urls.sh

exec node /app/apps/api/dist/apps/api/src/worker.js
