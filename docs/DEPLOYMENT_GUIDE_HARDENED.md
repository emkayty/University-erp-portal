# UniPortal ERP v24 — Hardened Deployment Guide

**Applies to:** the integrated academic-lifecycle hardened release.  
**Audience:** university IT, DevOps, security, registry, bursary, and implementation teams.

## Deployment model

UniPortal is a monorepo with three independently scaled runtime responsibilities. The web application is a Next.js frontend; the API is a NestJS HTTP process; and the worker handles BullMQ processors, scheduled tasks, reconciliation, and outbox delivery. Do not run API and worker behavior in the same production process.

| Component | Required runtime setting | Scaling guidance |
| --- | --- | --- |
| Web | Next.js standalone build | Stateless; scale horizontally behind CDN/load balancer. |
| API | `PROCESS_ROLE=api` | Stateless HTTP nodes; one or more instances. |
| Worker | `PROCESS_ROLE=worker` | Separate deployment; begin with one worker and scale only after queue/idempotency monitoring. |
| PostgreSQL | PostgreSQL 16 with pgvector | Managed, encrypted, backed up, private network access. |
| Redis | Redis 7 | Managed/private endpoint; use TLS where the provider requires it. |

## Non-negotiable deployment sequence

The same order applies on localhost, Render, AWS, GCP, and any other environment. The migration account must have schema rights; the API/worker application account should remain restricted under the application's RLS design.

1. Create PostgreSQL, Redis, and object storage.
2. Configure all required secrets without committing any `.env` file.
3. Run `pnpm install --frozen-lockfile --ignore-scripts`.
4. Generate and validate Prisma: `pnpm --filter @uniportal/api exec prisma generate --schema prisma/schema.prisma` and `pnpm --filter @uniportal/api exec prisma validate --schema prisma/schema.prisma`.
5. Apply migrations through the controlled schema deployment script. This release requires `0027_academic_lifecycle_integrity_hardening` after `0026_academic_lifecycle_completion`.
6. Seed only a controlled non-production environment, or use the formal bootstrap path with explicit administrator secrets.
7. Create and activate `PROGRESSION` and `ACADEMIC_STANDING` policy records for every applicable academic scope before staff run progression. Missing policy configuration fails closed.
8. Deploy the API, worker, and web processes separately.
9. Run health checks, the hermetic E2E suite, RLS matrix, payment-provider sandbox tests, and restore rehearsal before production sign-off.

> Do not use `prisma db push` against staging or production. Use the repository migration chain and the documented deployment scripts only.

## Required environment variables

The configuration schema rejects missing database, JWT, and encryption variables at startup. Generate independent production keys; never reuse local test material.

| Variable | Purpose | Production requirement |
| --- | --- | --- |
| `NODE_ENV` | Runtime mode | `production` for deployed services. |
| `PROCESS_ROLE` | Process responsibility | `api` for HTTP deployment; `worker` for background deployment. |
| `DATABASE_URL` | Restricted runtime PostgreSQL URL | Private TLS URL, normally the application/RLS role. |
| `DATABASE_DIRECT_URL` | Direct system PostgreSQL URL | Required by worker/privileged transactional paths; never expose to browser/web runtime. |
| `MIGRATE_DATABASE_URL` | Migration/schema deployment URL | Schema owner/controlled migration identity only. |
| `REDIS_URL` | Redis connection URL | Use `rediss://` when provider TLS is enabled. |
| `JWT_PRIVATE_KEY_B64` | RS256 signing key | Base64 PEM; secret manager only. |
| `JWT_PUBLIC_KEY_B64` | RS256 verification key | Base64 PEM corresponding to the private key. |
| `ENCRYPTION_KEY_HEX` | AES-256 application encryption key | Exactly 64 hex characters; rotate under a documented dual-key procedure. |
| `FRONTEND_ORIGIN` | CORS/redirect origin | Exact public web URL, including HTTPS. |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_WEBHOOK_SECRET` | Paystack integration | Configure only after sandbox verification. |
| `REMITA_*` variables | Remita integration | Configure against the university's signed merchant product contract. |
| `S3_*` / SMTP / Termii | Optional adapters | Configure only when the relevant adapter is certified. |

## Local development and MacBook rehearsal

Use Docker Desktop or another Docker-compatible local runtime. The normal compose stack is development-only and stores its data in named local volumes.

```bash
cp .env.example .env
# Fill local-only values. Do not copy production secrets.
docker compose up -d postgres redis
pnpm install --frozen-lockfile
pnpm --filter @uniportal/api exec prisma generate --schema prisma/schema.prisma
pnpm db:bootstrap-roles
DATABASE_AUTO_BOOTSTRAP_ROLES=true bash scripts/db/deploy-schema.sh
pnpm dev
```

For a production-like local start, build first and run the dedicated standalone web launcher plus separate API and worker commands. Use `docker compose down -v` only when intentionally discarding local development data.

Run the disposable E2E environment independently of local developer data:

```bash
pnpm test:e2e:hermetic
```

This command uses `docker-compose.e2e.yml`, temporary PostgreSQL storage, generated test JWT keys, and an ephemeral encryption key. It tears down the test stack even on failure.

## Render

Use the supplied `render.yaml` as the topology source. Create separate Render services for web, API, and worker, plus managed PostgreSQL and Redis. Put `MIGRATE_DATABASE_URL`, `DATABASE_DIRECT_URL`, payment secrets, and the JWT private key only in service-level encrypted environment variables. Run `scripts/db/deploy-schema.sh` as a one-off migration job before deploying a release that contains a new migration.

The web service must receive only public, browser-safe build-time variables. API and worker services must be private to the same Render network where possible. Configure health probes for API liveness/readiness and do not expose BullMQ dashboards publicly.

## Vercel

Deploy only `apps/web` to Vercel. Vercel is suitable for the Next.js frontend but is not the sole runtime for UniPortal because worker queues, long-lived PostgreSQL/RLS operations, and background reconciliation require a persistent API/worker environment.

Set the public API base URL as the web application's browser-safe environment variable, deploy the API and worker on Render, Cloud Run, ECS, or another container platform, and set `FRONTEND_ORIGIN` on the API to the exact Vercel domain. Keep all database, private JWT, encryption, provider, and Redis secrets out of Vercel's client bundle.

## Google Cloud Run

Build and deploy separate API and worker container images using the supplied Cloud Run manifests. Connect to Cloud SQL PostgreSQL through a private connector or Cloud SQL Auth Proxy configuration, and use Memorystore Redis through private networking. Configure minimum instances and concurrency based on live RLS transaction/load testing; avoid a configuration that lets long requests exhaust the PostgreSQL pool.

Run migrations as a Cloud Run Job or controlled CI step using `MIGRATE_DATABASE_URL`, then deploy `PROCESS_ROLE=api` and `PROCESS_ROLE=worker` as separate services. Store secrets in Secret Manager and attach them at runtime, not build time.

## Amazon Web Services ECS/Fargate

Use the supplied ECS task definitions as a baseline. Deploy API and worker as separate ECS services in private subnets behind an Application Load Balancer for API traffic. Use RDS PostgreSQL with required extensions and ElastiCache Redis; grant the migration task an isolated schema-owner secret and the application tasks restricted role URLs. Store all secret material in Secrets Manager or SSM Parameter Store.

Execute migrations as a one-off ECS task prior to service rollout. Configure automatic rollback only after confirming that the migration is backward-compatible with the running release; this archive's `0027` is append-only but still requires rehearsal on a restored production-like backup.

## Other container platforms

Any platform that supports separate container services, managed PostgreSQL, managed Redis, secret injection, health checks, and one-off migration jobs can host UniPortal. Preserve the API/worker split, private networking, migration-role separation, RLS behavior, and health/recovery controls. A single all-in-one free-tier process is unsuitable for production financial and academic records.

## Academic policy activation checklist

The academic service intentionally fails closed unless a valid policy applies. Before enabling the progression endpoint, Registry must load and approve both policy types for each programme or a broader parent scope.

| Policy type | Required JSON fields |
| --- | --- |
| `PROGRESSION` | `minCreditUnitsToProgress`, `minCgpaForUnconditionalProgress`, `maxCarryoversForConditionalProgress`, `conditionalProgressionAction` |
| `ACADEMIC_STANDING` | `probationCgpaThreshold`, `warningCgpaThreshold`, `consecutiveProbationPeriodsForSuspension` |

A programme-scoped policy has priority over department, faculty, and institution records. Ties use priority and then the most recent effective date. Capture governance approval separately in the university policy management workflow before activating an operational academic policy version.

## Release gate checklist

| Gate | Required before staging | Required before production |
| --- | --- | --- |
| Locked dependency install and Prisma validation | Yes | Yes |
| Type check, unit suite, build, security/deployment checks | Yes | Yes |
| Migration rehearsal on a cloned database | Recommended | Yes |
| `pnpm test:e2e:hermetic` | Yes | Yes |
| RLS role/tenant isolation matrix | Recommended | Yes |
| Paystack and Remita sandbox verification | When enabled | Yes, for every enabled provider |
| Backup and restore rehearsal | Recommended | Yes |
| Load/pool sizing test | Recommended | Yes |
| Registrar/Registry policy sign-off | Yes | Yes |

## References

[1] [Implementation report](ACADEMIC_LIFECYCLE_HARDENING_IMPLEMENTATION.md)  
[2] [Certification gates](CERTIFICATION_GATES.md)  
[3] [External integration certification](EXTERNAL_INTEGRATION_CERTIFICATION.md)  
[4] [Migration history](MIGRATION_HISTORY.md)


## P2 operational requirements

### Public admissions tracking

Set `ADMISSIONS_TRACKING_SECRET` to at least 32 random bytes, for example with `openssl rand -hex 32`, in every API environment that accepts public applications. The API fails closed for public application submission and status lookup when this secret is absent. A successful submission returns the application number and a 64-character tracking credential; the applicant must save both. The status page verifies the credential with constant-time HMAC comparison and no longer accepts an email address as the lookup proof.

The tracking credential is deliberately not stored as plaintext and is not returned by status responses. Rotate the secret only through a planned credential migration because existing deterministic credentials will no longer verify after rotation. Public application and tracking routes remain throttled and should additionally be protected at the edge with IP/device rate limits, bot controls, and monitoring appropriate to the institution's traffic profile.

### Complex curriculum allocation

Curricula with overlapping elective baskets may be bounded by the deterministic allocation search. If the search budget is exhausted before proving a result, the engine fails safe with `PENDING_REVIEW` and preserves unresolved requirement identifiers for authorized academic review; it does not publish a potentially false eligibility decision.

### RLS pool protection

Provider-initiation routes use the explicit request-transaction skip contract because they reserve local state, perform bounded provider I/O, and then execute protected database updates. Do not remove `@SkipRequestRlsTransaction()` from provider initiation without adding a tested per-operation RLS design. The hermetic E2E runner remains mandatory where Docker or equivalent managed services are available.
