#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEFAULT_NAME="uniportal-erp-deployment-ready-$(date -u +%Y%m%dT%H%M%SZ).zip"
OUTPUT_PATH="${1:-${ROOT_DIR}/../${DEFAULT_NAME}}"

case "${OUTPUT_PATH}" in
  /*) ;;
  *) OUTPUT_PATH="$(pwd)/${OUTPUT_PATH}" ;;
esac

mkdir -p "$(dirname "${OUTPUT_PATH}")"
rm -f "${OUTPUT_PATH}" "${OUTPUT_PATH}.sha256"

cd "${ROOT_DIR}"

# Zip receives a file list rather than recursively archiving the directory.
# This makes the exclusion policy explicit and preserves .env.example files.
find . \
  -type d \( \
    -name .git -o \
    -name node_modules -o \
    -name .turbo -o \
    -name .next -o \
    -name dist -o \
    -name coverage -o \
    -name test-results -o \
    -name .artifacts -o \
    -name __pycache__ -o \
    -name .pytest_cache \
  \) -prune -o \
  -type f \
  ! -name '*.tsbuildinfo' \
  ! -name '*.map' \
  ! -name '*.log' \
  ! -name '*.tmp' \
  ! -name '*.swp' \
  ! -path './pacts/*.json' \
  ! -name '.env' \
  ! \( -name '.env.*' ! -name '.env.example' \) \
  -print \
  | zip -q -0 -@ "${OUTPUT_PATH}"

sha256sum "${OUTPUT_PATH}" > "${OUTPUT_PATH}.sha256"

printf 'Release archive: %s\n' "${OUTPUT_PATH}"
printf 'Archive size:    %s\n' "$(du -h "${OUTPUT_PATH}" | cut -f1)"
printf 'SHA-256 file:    %s\n' "${OUTPUT_PATH}.sha256"
printf 'Excluded generated content: .git node_modules .turbo .next dist coverage test-results .artifacts pacts/*.json\n'
