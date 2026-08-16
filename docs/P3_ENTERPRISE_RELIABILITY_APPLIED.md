# P3 Enterprise Reliability & Production Readiness

## Objectives

- Protect academic, financial and identity data from accidental loss.
- Detect dependency failures quickly.
- Make deployments reversible.
- Make database restores verifiable rather than assumed.
- Prevent production configuration mistakes from silently becoming security incidents.

## Health model

- `/api/health/live`: process liveness.
- `/api/health/ready`: PostgreSQL + Redis readiness.
- `/api/health`: DB, Redis, memory and disk health.
- `/api/reliability/version`: build/environment identity without secrets.
- `/api/reliability/db`: lightweight database dependency probe.

Do not use a full dependency check as a Kubernetes/container liveness probe: a temporary database outage should not cause an otherwise healthy process to restart repeatedly.

## Backup policy

Recommended production baseline:

- PostgreSQL: daily full logical backup + continuous WAL/PITR where infrastructure supports it.
- Keep at least one backup copy outside the primary failure domain.
- Encrypt backups at rest and in transit.
- Test restoration at least monthly and after major schema changes.
- Never consider a backup successful until checksum and restore verification succeed.

The included `scripts/db/backup.sh` creates a PostgreSQL custom-format dump and SHA-256 checksum.
`scripts/db/restore.sh` verifies the checksum and requires explicit confirmation before restoring.

## Suggested service targets

Institution-specific values must be agreed with management, but a reasonable starting target is:

- RPO: <= 15 minutes for production database using PITR.
- RTO: <= 2 hours for a major infrastructure failure.
- Critical admission/payment/result workflows: prioritize correctness over availability during dependency uncertainty.

## Deployment gates

Every release should pass:

1. frozen dependency install
2. Prisma generation
3. type-check
4. unit/integration tests
5. formatting
6. production build
7. database migration review
8. backup verification before destructive migrations
9. smoke test after deployment
10. health/readiness verification

## Rollback

- Application rollback: deploy previous immutable image/build.
- Database rollback: prefer forward-compatible migration strategy; do not casually run destructive reverse migrations against production academic/financial data.
- If a migration changes authoritative academic or financial meaning, take a verified backup first and use a tested forward repair rather than deleting historical records.

## Security

- Production secrets belong in a secret manager, not `.env` files committed to source.
- Do not enable pgAdmin/Redis Commander on production hosts.
- Restrict database and Redis network exposure to private application networks.
- Use TLS for external and cross-host connections.
- Rotate signing/encryption credentials according to the documented key-rotation procedure.
- Do not log access tokens, passwords, payment secrets, NIN/BVN or medical content.

## Incident priorities

P0:
- unauthorized data exposure
- corrupted results/grades
- payment reconciliation corruption
- loss of database integrity

P1:
- admissions unavailable
- registration unavailable
- exam/result publishing unavailable
- authentication unavailable

P2:
- non-critical enterprise module unavailable
- delayed notifications/reports

## Observability

At minimum collect:

- request count
- error count/rate
- latency p50/p95/p99
- DB query latency
- queue depth and failed jobs
- authentication failures
- payment webhook failures
- notification delivery failures
- disk/storage utilization
- database connection saturation

Never make dashboards depend on sensitive raw records when an aggregate metric is sufficient.
