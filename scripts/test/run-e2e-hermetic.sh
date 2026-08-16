#!/usr/bin/env bash
# Disposable database-backed API certification. Never points at development or
# production endpoints; the compose stack uses tmpfs storage and is torn down
# on completion, including on test failure.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.e2e.yml"
KEY_DIR="$(mktemp -d)"

cleanup() {
  docker compose -f "$COMPOSE_FILE" down --volumes --remove-orphans >/dev/null 2>&1 || true
  rm -rf "$KEY_DIR"
}
trap cleanup EXIT

command -v docker >/dev/null || { echo "Docker is required for hermetic E2E certification." >&2; exit 1; }
command -v openssl >/dev/null || { echo "OpenSSL is required to generate ephemeral E2E JWT keys." >&2; exit 1; }

openssl genrsa -out "$KEY_DIR/jwt-private.pem" 2048 >/dev/null 2>&1
openssl rsa -in "$KEY_DIR/jwt-private.pem" -pubout -out "$KEY_DIR/jwt-public.pem" >/dev/null 2>&1

export NODE_ENV=test
export PROCESS_ROLE=api
export DATABASE_URL='postgresql://uniportal_e2e:uniportal_e2e_only@127.0.0.1:55432/uniportal_e2e?schema=public'
export DATABASE_DIRECT_URL="$DATABASE_URL"
export DATABASE_TEST_URL="$DATABASE_URL"
export REDIS_URL='redis://127.0.0.1:56379'
export REDIS_TLS=false
export JWT_PRIVATE_KEY_B64
export JWT_PUBLIC_KEY_B64
export ENCRYPTION_KEY_HEX
JWT_PRIVATE_KEY_B64="$(base64 -w 0 "$KEY_DIR/jwt-private.pem")"
JWT_PUBLIC_KEY_B64="$(base64 -w 0 "$KEY_DIR/jwt-public.pem")"
ENCRYPTION_KEY_HEX="$(openssl rand -hex 32)"

cd "$ROOT_DIR"
docker compose -f "$COMPOSE_FILE" up --wait
pnpm --filter @uniportal/api exec prisma migrate deploy --schema prisma/schema.prisma
pnpm --filter @uniportal/api test:e2e -- --runInBand
