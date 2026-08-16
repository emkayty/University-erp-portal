#!/usr/bin/env bash
# Start the Next.js standalone web server from a monorepo checkout.
# Next's standalone output intentionally excludes public/ and .next/static;
# stage both beside server.js before every local launch.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WEB_DIR="$ROOT_DIR/apps/web"
BUILD_DIR="$WEB_DIR/.next"
RUNTIME_DIR="$BUILD_DIR/standalone/apps/web"

if [[ ! -f "$RUNTIME_DIR/server.js" ]]; then
  echo "Standalone web build not found at $RUNTIME_DIR/server.js." >&2
  echo "Run: pnpm --filter @uniportal/web run build" >&2
  exit 1
fi

if [[ ! -d "$BUILD_DIR/static" ]]; then
  echo "Next.js static assets not found at $BUILD_DIR/static." >&2
  echo "Run: pnpm --filter @uniportal/web run build" >&2
  exit 1
fi

mkdir -p "$RUNTIME_DIR/.next"
rm -rf "$RUNTIME_DIR/.next/static"
cp -a "$BUILD_DIR/static" "$RUNTIME_DIR/.next/static"

if [[ -d "$WEB_DIR/public" ]]; then
  rm -rf "$RUNTIME_DIR/public"
  cp -a "$WEB_DIR/public" "$RUNTIME_DIR/public"
fi

export NODE_ENV="${NODE_ENV:-production}"
# Next's generated server reads HOSTNAME. Ignore the shell's inherited machine
# hostname so the service is externally reachable by default; WEB_HOSTNAME is
# the explicit opt-in override for an internal-only bind.
export HOSTNAME="${WEB_HOSTNAME:-0.0.0.0}"
export PORT="${PORT:-3000}"

exec node "$RUNTIME_DIR/server.js"
