#!/usr/bin/env bash
set -euo pipefail

# Prisma schema parsing requires both datasource URLs even for generate/validate.
# These placeholders are intentionally used only by non-connecting CLI commands;
# migration deployment still requires explicit production credentials in the
# certification script.
export DATABASE_URL="${DATABASE_URL:-postgresql://prisma_validate:prisma_validate@127.0.0.1:5432/prisma_validate?schema=public}"
export MIGRATE_DATABASE_URL="${MIGRATE_DATABASE_URL:-$DATABASE_URL}"
exec "$@"
