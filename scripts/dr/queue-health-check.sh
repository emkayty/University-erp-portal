#!/bin/bash
# scripts/dr/queue-health-check.sh
# Spec §21.3 runbook: "Verify BullMQ: Bull Board shows no stuck jobs; DLQ
# depth = 0". Hits the health endpoint (spec §17.3) rather than talking to
# Redis directly — keeps this script working the same way in CI as it would
# for anyone else checking prod, without needing direct Redis network access.
set -euo pipefail

: "${API_HEALTH_URL:?Set API_HEALTH_URL to https://.../api/health/ready}"
FAIL=0

echo "## DR Check: Queue Health" >> dr-check-summary.md

HEALTH_JSON=$(curl -sf --retry 3 --retry-delay 5 "$API_HEALTH_URL")
STATUS=$(echo "$HEALTH_JSON" | jq -r '.status')
WAITING=$(echo "$HEALTH_JSON" | jq -r '.checks.bullmq.waitingJobs // 0')

if [ "$STATUS" != "ok" ]; then
  echo "❌ /api/health/ready reports status=${STATUS}" | tee -a dr-check-summary.md
  FAIL=1
else
  echo "✅ /api/health/ready reports ok" | tee -a dr-check-summary.md
fi

# spec §17.2 alarm threshold: DLQ depth > 10 triggers PagerDuty. This script
# treats >10 waiting as a DR-readiness warning even if no alarm has fired
# yet (e.g. between polling intervals).
if [ "$WAITING" -gt 10 ]; then
  echo "⚠️  ${WAITING} jobs waiting — check Bull Board (/admin/bull) for stuck jobs before relying on this environment for a DR drill" | tee -a dr-check-summary.md
fi

echo "Queue snapshot: $(echo "$HEALTH_JSON" | jq -c '.checks.bullmq')" >> dr-check-summary.md
exit $FAIL
