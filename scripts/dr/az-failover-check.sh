#!/bin/bash
# scripts/dr/az-failover-check.sh
# Verifies both AZs are actually healthy RIGHT NOW, so an AZ failure would
# genuinely fail over cleanly rather than discovering mid-incident that the
# second AZ's instance has been unhealthy for a week. Implements the first
# two bullets of spec §21.3's runbook as an automated, repeatable check.
set -euo pipefail
ENV="${DEPLOY_ENV:-production}"
FAIL=0

echo "## DR Check: AZ Failover Readiness" >> dr-check-summary.md

ASG_NAME="uniportal-${ENV}-asg"
INSTANCES=$(aws autoscaling describe-auto-scaling-groups --auto-scaling-group-names "$ASG_NAME" \
  --query 'AutoScalingGroups[0].Instances[].[InstanceId,AvailabilityZone,HealthStatus]' --output text)

AZ_COUNT=$(echo "$INSTANCES" | awk '{print $2}' | sort -u | wc -l)
if [ "$AZ_COUNT" -lt 2 ]; then
  echo "❌ ASG instances are only spread across ${AZ_COUNT} AZ(s) — an AZ failure would take the whole fleet down" | tee -a dr-check-summary.md
  FAIL=1
else
  echo "✅ ASG instances span ${AZ_COUNT} AZs" | tee -a dr-check-summary.md
fi

UNHEALTHY=$(echo "$INSTANCES" | awk '$3 != "Healthy" {print $1}')
if [ -n "$UNHEALTHY" ]; then
  echo "❌ Unhealthy instance(s): ${UNHEALTHY}" | tee -a dr-check-summary.md
  FAIL=1
else
  echo "✅ All ASG instances report Healthy" | tee -a dr-check-summary.md
fi

# ALB target group health, per AZ
for TG in "uniportal-${ENV}-tg-blue" "uniportal-${ENV}-tg-green"; do
  TG_ARN=$(aws elbv2 describe-target-groups --names "$TG" --query 'TargetGroups[0].TargetGroupArn' --output text 2>/dev/null || echo "")
  [ -z "$TG_ARN" ] && continue
  UNHEALTHY_TARGETS=$(aws elbv2 describe-target-health --target-group-arn "$TG_ARN" \
    --query 'TargetHealthDescriptions[?TargetHealth.State!=`healthy`]' --output text)
  if [ -n "$UNHEALTHY_TARGETS" ]; then
    echo "⚠️  ${TG} has unhealthy targets (expected if this is the idle blue/green side)" | tee -a dr-check-summary.md
  fi
done

# ElastiCache Multi-AZ
REPLICATION_GROUP="uniportal-${ENV}-redis"
MULTI_AZ=$(aws elasticache describe-replication-groups --replication-group-id "$REPLICATION_GROUP" \
  --query 'ReplicationGroups[0].MultiAZ' --output text)
if [ "$MULTI_AZ" != "enabled" ]; then
  echo "❌ ElastiCache Multi-AZ is not enabled" | tee -a dr-check-summary.md
  FAIL=1
else
  echo "✅ ElastiCache Multi-AZ enabled" | tee -a dr-check-summary.md
fi

exit $FAIL
