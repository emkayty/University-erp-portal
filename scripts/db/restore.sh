#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_FILE:?BACKUP_FILE is required}"

test -f "$BACKUP_FILE"
test -f "$BACKUP_FILE.sha256"

sha256sum --check "$BACKUP_FILE.sha256"

echo "WARNING: restore overwrites objects in the target database."
echo "Target is DATABASE_URL supplied by the environment."
read -r -p "Type RESTORE to continue: " confirm
[[ "$confirm" == "RESTORE" ]]

pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --dbname="$DATABASE_URL" \
  "$BACKUP_FILE"

echo "Restore completed."
