#!/usr/bin/env bash
# Destructive data reset for the explicitly confirmed Neon ERP database.
# This intentionally preserves schema objects, extensions, roles, and
# _prisma_migrations. It must never be used as a generic local reset helper.
set -euo pipefail

: "${MIGRATE_DATABASE_URL:?MIGRATE_DATABASE_URL must be set}"
: "${CONFIRM_NEON_RESET:?Set CONFIRM_NEON_RESET=YES to authorize the destructive Neon data reset}"
: "${NEON_BACKUP_FILE:?Set NEON_BACKUP_FILE to the completed local pg_dump file}"

if [[ "${CONFIRM_NEON_RESET}" != "YES" ]]; then
  echo "Refusing Neon reset: CONFIRM_NEON_RESET must equal YES." >&2
  exit 2
fi

if [[ ! -s "${NEON_BACKUP_FILE}" ]]; then
  echo "Refusing Neon reset: backup file is missing or empty: ${NEON_BACKUP_FILE}" >&2
  exit 2
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required for the controlled Neon reset." >&2
  exit 1
fi

identity="$(psql "${MIGRATE_DATABASE_URL}" -X -v ON_ERROR_STOP=1 -Atc 'SELECT current_database() || E'"'"'|'"'"' || current_user;')"
IFS='|' read -r database_name database_user <<< "${identity}"

if [[ "${database_name}" != "neondb" ]]; then
  echo "Refusing reset: expected database neondb, received ${database_name:-<empty>}." >&2
  exit 2
fi

if [[ -z "${database_user}" ]]; then
  echo "Refusing reset: PostgreSQL identity could not be determined." >&2
  exit 2
fi

table_count="$(psql "${MIGRATE_DATABASE_URL}" -X -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p','f');")"
echo "Confirmed Neon target: database=${database_name}, user=${database_user}, public_relations=${table_count}."
echo "Preserving schema objects and truncating application rows; _prisma_migrations is excluded."

psql "${MIGRATE_DATABASE_URL}" -X -v ON_ERROR_STOP=1 <<'SQL'
DO $$
DECLARE
  relation_record record;
BEGIN
  FOR relation_record IN
    SELECT schemaname, tablename
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename <> '_prisma_migrations'
    ORDER BY tablename
  LOOP
    EXECUTE format(
      'TRUNCATE TABLE %I.%I RESTART IDENTITY CASCADE',
      relation_record.schemaname,
      relation_record.tablename
    );
  END LOOP;
END
$$;
SQL

echo "Neon application data reset completed; schema, roles, extensions, and migration history were preserved."
