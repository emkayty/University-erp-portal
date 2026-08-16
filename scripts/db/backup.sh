#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_DIR:=./backups}"
: "${DATABASE_URL:?DATABASE_URL is required}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
file="$BACKUP_DIR/uniportal_${stamp}.dump"

umask 077
pg_dump "$DATABASE_URL" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="$file"

sha256sum "$file" > "$file.sha256"
echo "Backup created: $file"
echo "Checksum: $file.sha256"
