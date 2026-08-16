#!/usr/bin/env bash
# Build restricted runtime PostgreSQL URLs when a platform exposes database
# host components rather than supporting environment-variable interpolation.
# Use URL-safe hexadecimal passwords for DATABASE_APP_PASSWORD and
# DATABASE_SYSTEM_PASSWORD when this helper is used.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -n "${DATABASE_ADMIN_URL:-}" ]]; then
  # The helper emits shell-quoted export statements and only substitutes the
  # login role and password; hostname, port, database, and TLS parameters stay
  # exactly as supplied by the managed provider.
  source <(node "${SCRIPT_DIR}/derive-runtime-database-urls.cjs")
fi

if [[ -z "${DATABASE_URL:-}" && -n "${DATABASE_HOST:-}" ]]; then
  : "${DATABASE_APP_PASSWORD:?DATABASE_APP_PASSWORD is required with DATABASE_HOST}"
  : "${DATABASE_NAME:?DATABASE_NAME is required with DATABASE_HOST}"
  DATABASE_PORT="${DATABASE_PORT:-5432}"
  DATABASE_APP_USER="${DATABASE_APP_USER:-uniportal_app}"
  DATABASE_SSL_MODE="${DATABASE_SSL_MODE:-require}"
  export DATABASE_URL="postgresql://${DATABASE_APP_USER}:${DATABASE_APP_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}?sslmode=${DATABASE_SSL_MODE}"
fi

if [[ -z "${DATABASE_DIRECT_URL:-}" && -n "${DATABASE_HOST:-}" ]]; then
  : "${DATABASE_SYSTEM_PASSWORD:?DATABASE_SYSTEM_PASSWORD is required with DATABASE_HOST}"
  : "${DATABASE_NAME:?DATABASE_NAME is required with DATABASE_HOST}"
  DATABASE_PORT="${DATABASE_PORT:-5432}"
  DATABASE_SYSTEM_USER="${DATABASE_SYSTEM_USER:-uniportal_system}"
  DATABASE_SSL_MODE="${DATABASE_SSL_MODE:-require}"
  export DATABASE_DIRECT_URL="postgresql://${DATABASE_SYSTEM_USER}:${DATABASE_SYSTEM_PASSWORD}@${DATABASE_HOST}:${DATABASE_PORT}/${DATABASE_NAME}?sslmode=${DATABASE_SSL_MODE}"
fi
