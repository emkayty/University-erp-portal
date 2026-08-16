#!/usr/bin/env bash
# Fail-closed evidence gate for checks that cannot be honestly performed from source alone.
set -euo pipefail

if [[ "${NODE_ENV:-development}" != "production" && "${REQUIRE_RUNTIME_CERT_EVIDENCE:-false}" != "true" ]]; then
  echo "Runtime certification evidence gate skipped outside production."
  exit 0
fi

: "${CERT_EVIDENCE_DIR:=artifacts/certification}"
mkdir -p "$CERT_EVIDENCE_DIR"

required_flags=(
  RLS_RUNTIME_EVIDENCE_APPROVED
  BACKUP_RESTORE_DRILL_APPROVED
  DR_FAILOVER_DRILL_APPROVED
  PERFORMANCE_EVIDENCE_APPROVED
  UI_E2E_EVIDENCE_APPROVED
)
for flag in "${required_flags[@]}"; do
  if [[ "${!flag:-false}" != "true" ]]; then
    echo "Missing approved runtime evidence: ${flag}=true" >&2
    exit 2
  fi
done

required_files=(
  rls-runtime-evidence.json
  backup-restore-evidence.json
  dr-failover-evidence.json
  performance-evidence.json
  ui-e2e-accessibility-evidence.json
)
for file in "${required_files[@]}"; do
  [[ -s "$CERT_EVIDENCE_DIR/$file" ]] || { echo "Missing evidence artifact: $CERT_EVIDENCE_DIR/$file" >&2; exit 3; }
done

jq -e 'type == "object" and .executedAt and .result' "$CERT_EVIDENCE_DIR/rls-runtime-evidence.json" >/dev/null
jq -e 'type == "object" and .executedAt and .result' "$CERT_EVIDENCE_DIR/backup-restore-evidence.json" >/dev/null
jq -e 'type == "object" and .executedAt and .result' "$CERT_EVIDENCE_DIR/dr-failover-evidence.json" >/dev/null
jq -e 'type == "object" and .executedAt and .result' "$CERT_EVIDENCE_DIR/performance-evidence.json" >/dev/null
jq -e 'type == "object" and .executedAt and .result' "$CERT_EVIDENCE_DIR/ui-e2e-accessibility-evidence.json" >/dev/null

for file in "${required_files[@]}"; do
  jq -e '.result == "PASS"' "$CERT_EVIDENCE_DIR/$file" >/dev/null || { echo "Evidence result is not PASS: $file" >&2; exit 4; }
done

echo "Automated runtime-evidence gate passed: required approved artifacts are present and marked PASS. This does not execute or independently certify the underlying drills."
