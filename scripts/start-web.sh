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

# Next standalone tracing can preserve a pnpm symlink to @swc/helpers without
# copying the package's ESM files. Repair that link before starting so local,
# CI, and container launches use the same deterministic runtime.
stage_swc_helpers() {
  local next_dir helper_source helper_target
  next_dir="$(find "$BUILD_DIR/standalone/node_modules/.pnpm" -type d -path '*/node_modules/next' -print -quit 2>/dev/null || true)"
  helper_source="$(find "$ROOT_DIR/node_modules/.pnpm" -type d -path '*/node_modules/@swc/helpers' -print -quit 2>/dev/null || true)"
  if [[ -z "$next_dir" || -z "$helper_source" ]]; then
    echo "Unable to locate the standalone Next.js runtime or @swc/helpers package." >&2
    echo "Run pnpm install and pnpm --filter @uniportal/web run build, then retry." >&2
    exit 1
  fi
  if [[ ! -f "$helper_source/esm/_interop_require_default.js" ]]; then
    echo "The installed @swc/helpers package is missing its ESM runtime files." >&2
    echo "Run pnpm install and pnpm --filter @uniportal/web run build, then retry." >&2
    exit 1
  fi
  helper_target="$(dirname "$next_dir")/@swc/helpers"
  if [[ ! -f "$helper_target/esm/_interop_require_default.js" ]]; then
    mkdir -p "$(dirname "$helper_target")"
    rm -rf "$helper_target"
    cp -a "$helper_source" "$helper_target"
  fi
}

stage_swc_helpers

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
