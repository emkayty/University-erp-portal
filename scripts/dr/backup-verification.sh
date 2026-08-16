#!/bin/bash
# scripts/dr/backup-verification.sh
# Verifies the spec §21.2 backup schedule is actually in effect — read-only,
# safe to run anytime, designed for the weekly dr-validation.yml workflow.
set -euo pipefail

ENV="${DEPLOY_ENV:-production}"
INSTANCE_ID="uniportal-${ENV}-primary"
FAIL=0

echo "## DR Check: Backup Verification" | tee dr-check-summary.md

# 1. Multi-AZ enabled
MULTI_AZ=$(aws rds describe-db-instances --db-instance-identifier "$INSTANCE_ID" \
  --query 'DBInstances[0].MultiAZ' --output text)
if [ "$MULTI_AZ" != "True" ]; then
  echo "❌ RDS Multi-AZ is NOT enabled (spec §19.1 requires it)" | tee -a dr-check-summary.md
  FAIL=1
else
  echo "✅ RDS Multi-AZ enabled" | tee -a dr-check-summary.md
fi

# 2. Automated backup retention == 35 days (spec §21.2 PITR window)
RETENTION=$(aws rds describe-db-instances --db-instance-identifier "$INSTANCE_ID" \
  --query 'DBInstances[0].BackupRetentionPeriod' --output text)
if [ "$RETENTION" -lt 35 ]; then
  echo "❌ Backup retention is ${RETENTION} days, spec §21.2 requires 35" | tee -a dr-check-summary.md
  FAIL=1
else
  echo "✅ Backup retention: ${RETENTION} days" | tee -a dr-check-summary.md
fi

# 3. Latest automated backup is recent (within last 25h — daily backup window + margin)
LATEST_BACKUP=$(aws rds describe-db-instances --db-instance-identifier "$INSTANCE_ID" \
  --query 'DBInstances[0].LatestRestorableTime' --output text)
LATEST_EPOCH=$(date -d "$LATEST_BACKUP" +%s 2>/dev/null || date -j -f "%Y-%m-%dT%H:%M:%S" "${LATEST_BACKUP%%+*}" +%s)
NOW_EPOCH=$(date +%s)
AGE_HOURS=$(( (NOW_EPOCH - LATEST_EPOCH) / 3600 ))
if [ "$AGE_HOURS" -gt 25 ]; then
  echo "❌ Latest restorable time is ${AGE_HOURS}h old — PITR window may have a gap" | tee -a dr-check-summary.md
  FAIL=1
else
  echo "✅ Latest restorable time: ${AGE_HOURS}h ago" | tee -a dr-check-summary.md
fi

# 4. S3 versioning enabled on all 3 buckets (spec §21.2)
for BUCKET in "uniportal-${ENV}-uploads" "uniportal-${ENV}-reports" "uniportal-${ENV}-static"; do
  STATUS=$(aws s3api get-bucket-versioning --bucket "$BUCKET" --query Status --output text 2>/dev/null || echo "MISSING")
  if [ "$STATUS" != "Enabled" ]; then
    echo "❌ S3 versioning not enabled on ${BUCKET} (status: ${STATUS})" | tee -a dr-check-summary.md
    FAIL=1
  else
    echo "✅ S3 versioning enabled: ${BUCKET}" | tee -a dr-check-summary.md
  fi
done

exit $FAIL
