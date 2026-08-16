# Disaster Recovery Runbook

Formalises spec §21 (Recovery Objectives, Backup Schedule, AZ Failover
Validation) into a procedure with automated checks + manual drill steps.
The automated half runs weekly via `.github/workflows/dr-validation.yml`;
this document is for the half that can't be automated against a live
environment safely.

## Recovery objectives (spec §21.1) — unchanged reference

| Scenario | RTO | RPO |
|---|---|---|
| AZ failure | < 15 min | < 30 sec |
| Full region disaster | < 4 hours | < 1 hour |
| Database corruption (row-level) | < 1 hour | < 30 min |
| Redis failure | < 5 min | Session re-login |
| BullMQ job loss | < 30 min | Jobs since last AOF flush |

## Continuously automated (scripts/dr/, weekly via GH Actions)

| Script | Checks |
|---|---|
| `backup-verification.sh` | RDS Multi-AZ on, 35-day retention, latest restorable time <25h old, S3 versioning on all 3 buckets |
| `az-failover-check.sh` | ASG spans ≥2 AZs, all instances Healthy, ElastiCache Multi-AZ on |
| `queue-health-check.sh` | `/api/health` reports `ok`, BullMQ waiting-job count within the spec §17.2 DLQ alarm threshold |

A failing run pages the on-call via the workflow's job failure (wire
`AWS_READONLY_ROLE_ARN` / `PROD_API_URL` secrets in repo settings) — the
whole point is finding "the second AZ has been unhealthy for a week" on a
quiet Monday, not during an actual incident.

## Manual quarterly drill — AZ failover (spec §21.3)

Genuinely triggering an AZ failure against production is what the drill
validates; scripting it away would defeat the purpose. Procedure:

1. **Announce** the drill window to stakeholders (spec §21.3: "Notify
   stakeholders within T+15 minutes of incident start" — for a planned
   drill, notify *before* starting instead).
2. **Trigger**: `aws rds reboot-db-instance --db-instance-identifier
   uniportal-production-primary --force-failover` — forces RDS Multi-AZ
   failover to the standby.
3. **Time it**: failover should complete and `/api/health` should return
   `ok` again within the RTO (<30s RPO / near-zero downtime is the
   Multi-AZ promise — if it takes materially longer, that's the finding).
4. **Run** `scripts/dr/az-failover-check.sh` and `scripts/dr/queue-health-check.sh`
   manually immediately after, plus a real login + course-registration
   smoke test through the actual UI (the automated checks don't cover
   application-level correctness, only infra health).
5. **Record** actual RTO/RPO achieved vs. target in this file's "Drill Log"
   below.

## Manual annual drill — PITR restore (spec §21.1: DB corruption scenario)

1. `aws rds restore-db-instance-to-point-in-time` from the primary into a
   **new, isolated** instance (never restore over the live primary).
2. Point a scratch `DATABASE_URL` at the restored instance; run the app's
   own health checks + a handful of read queries against known-good rows
   to confirm the restore is queryable and at the expected point in time.
3. Tear the scratch instance down after — this drill validates the
   *mechanism*, not a real recovery.

## Manual annual drill — full region failover (spec §21.1)

Requires a warm/cold standby in a second region (Route 53 failover +
cross-region S3 replication + RDS snapshot restore, per spec §21.1) which
is NOT yet provisioned by `infra/` — this Terraform is single-region
(Phase 1/2 scope). Stand this drill up when a second-region deployment
exists; tracking this as a follow-up rather than claiming region-failover
coverage that isn't actually there yet.

## Drill Log

| Date | Drill | Target RTO | Actual | Notes |
|---|---|---|---|---|
| _(none yet — first scheduled drill goes here)_ | | | | |
