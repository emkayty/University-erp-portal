# Production Release Checklist

## Before release
- [ ] PR quality workflow green
- [ ] Dependency lockfile unchanged or reviewed
- [ ] Prisma schema validated/generated
- [ ] Migration reviewed for destructive operations
- [ ] Verified database backup available
- [ ] Secrets present in secret manager
- [ ] Feature flags reviewed
- [ ] External payment/webhook endpoints verified
- [ ] Queue workers healthy
- [ ] Monitoring/alerts active

## After release
- [ ] `/api/health/live` returns OK
- [ ] `/api/health/ready` returns healthy
- [ ] Login + MFA smoke test
- [ ] Student record smoke test
- [ ] Registration smoke test
- [ ] Results read/publish smoke test in non-production/staging
- [ ] Payment webhook verification
- [ ] Notification delivery check
- [ ] Queue failure/dead-letter check
- [ ] Error rate and p95 latency normal

## Academic safety rule

If a deployment produces uncertainty about authoritative student results, registrations, fees or graduation eligibility, stop the rollout and preserve the current database state. Do not "fix" production by deleting or manually editing historical academic records.
