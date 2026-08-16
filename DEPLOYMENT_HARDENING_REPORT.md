# UniPortal ERP v24 — Final Deployment Hardening Report

**Prepared by:** Manus AI  
**Release state:** Source hardened and packaged for controlled deployment  
**Assessment date:** 14 August 2026

## Executive assessment

UniPortal has been materially strengthened from a source-only monorepo into a deployable system with explicit API, worker, database, Redis, web, schema-release, and platform configuration boundaries. The repaired release supports local production-like Docker Compose, Render, Vercel (frontend only), Google Cloud Run, Amazon ECS/Fargate, and other Docker-capable hosts.

The most important architectural correction is the separation of public request handling from durable asynchronous processing. The API now emits and enqueues work; a dedicated singleton worker process consumes BullMQ queues and owns recurring schedules. This removes the earlier risk that every horizontally scaled HTTP replica could process jobs or fire cron work concurrently.

| Assessment domain                   | Status                                   | Conclusion                                                                                                            |
| ----------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| API/Web compilation                 | **Validated**                            | Full production builds pass.                                                                                          |
| Unit/regression testing             | **Validated**                            | 23 suites and 364 tests pass.                                                                                         |
| API/worker Node startup             | **Validated**                            | Compiled JavaScript starts without production `ts-node` loaders.                                                      |
| Worker lifecycle ownership          | **Repaired and validated**               | Processor and scheduler providers are worker-only.                                                                    |
| Docker/Compose artifacts            | **Created and statically validated**     | Runtime image build could not be executed because Docker is unavailable in this sandbox.                              |
| Render/Vercel/Cloud Run/ECS configs | **Created and structurally validated**   | Final account/domain/secret provisioning remains an authorized operator task.                                         |
| Fresh-database path                 | **Repaired with a controlled exception** | Uses Prisma `db push` plus explicit extensions/RLS hardening because the old migration chain is not a fresh baseline. |

## Implemented repairs

### Runtime, scope, and process-role repairs

The hardening pass eliminated request-scope leakage from background components. `AdmissionsOpsProcessor` no longer injects an unused request-scoped admissions service. HR automatic leave restoration was moved from the request-facing HR service into `HrLeaveRestorationScheduler`, a singleton scheduler that performs conditional idempotent updates and creates a system audit record atomically.

A new `PROCESS_ROLE` environment contract drives module provider registration. The API role does not instantiate processors, outbox polling, session cleanup, partition maintenance, payment reconciliation schedules, HR leave restoration, reports generation, notifications, admissions operations, or breach notifications. The worker role instantiates them. This prevents duplicate queue consumers and duplicate cron execution when API services scale.

The outbox polling cron was separated from the shared `OutboxService` writer into `OutboxDispatchScheduler`. This preserves API-side transactional event writing without allowing every API process to poll the same outbox table.

### Production startup and dependencies

Workspace runtime packages (`@uniportal/config`, `@uniportal/types`, and `@uniportal/utils`) now have `dist/` main/type exports and TypeScript build scripts. API production commands now use compiled Node entrypoints:

```text
pnpm start:prod   -> PROCESS_ROLE=api node dist/apps/api/src/main.js
pnpm start:worker -> PROCESS_ROLE=worker node dist/apps/api/src/worker.js
```

The development watcher retains `ts-node` and path mapping only for local development. Plain Node resolution for all three workspace packages was independently smoke-tested against their compiled exports.

### Managed Redis and platform interoperability

A shared Redis connection resolver now accepts either explicit `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD` settings or a provider-supplied `REDIS_URL`. It is used consistently by cache-manager, BullMQ, and direct ioredis clients. This also fixes the prior error that enabled Redis TLS automatically for every production process, which would break private non-TLS Redis services such as local Docker Compose and many managed private endpoints.

### Fresh database and RLS controls

The historical Prisma migration sequence cannot be safely applied to a brand-new database. The release therefore introduces an explicit release job path:

1. `bootstrap-production-roles.sh` creates/configures `uniportal_app` and `uniportal_system` through an administrator PostgreSQL URL.
2. `deploy-schema.sh` prepares extensions, executes non-destructive `prisma db push` through the owner URL, and applies database grants/RLS hardening.
3. `apply-post-schema-hardening.sh` establishes required extensions, restricted role grants, protected-table RLS, and policy baseline.

This is a deliberate compatibility bridge, not a substitute for future migration-baseline engineering. A future release should replace the historic chain with a reviewed consolidated baseline migration and an upgrade path for existing databases.

### Portable deployment assets

| Asset                     | Purpose                                                                                                                                        |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/Dockerfile`     | Multi-stage API/worker image with compiled workspace outputs, Prisma client, PostgreSQL client, non-root runtime user, and production scripts. |
| `apps/web/Dockerfile`     | Multi-stage Next.js standalone image.                                                                                                          |
| `.dockerignore`           | Excludes secrets, local dependencies, build artifacts, databases, reports, and archives from Docker context.                                   |
| `docker-compose.prod.yml` | Durable Postgres/Redis plus one API, one worker, one web service, and an explicit maintenance-profile schema job.                              |
| `render.yaml`             | Render API + worker + managed Postgres + persistent Key Value Blueprint.                                                                       |
| `apps/web/vercel.json`    | Monorepo-aware Vercel frontend configuration.                                                                                                  |
| `infra/gcp/*.yaml`        | Cloud Run API, worker, and web service manifests.                                                                                              |
| `infra/aws/*.json`        | ECS/Fargate API, worker, and web task definitions.                                                                                             |
| `DEPLOYMENT_GUIDE.md`     | Operator-facing release runbook and platform procedures.                                                                                       |

## Validation evidence

| Validation                                    | Result                                                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @uniportal/api run type-check` | Passed after the scope refactor and Redis resolver changes.                                                                             |
| `pnpm build`                                  | Passed. The API, three workspace packages, and Next.js app build successfully. The web build generated 33 routes and standalone output. |
| `pnpm test`                                   | Passed: 18 API suites/330 tests and 5 utility suites/34 tests.                                                                          |
| API compiled-JS smoke                         | Passed. The Nest application booted successfully through `node dist/apps/api/src/main.js`.                                              |
| Worker compiled-JS smoke                      | Passed. Queue/schedule process booted through `node dist/apps/api/src/worker.js`, accepted SIGTERM, and entered its shutdown lifecycle. |
| Web standalone smoke                          | Passed. The standalone server started and returned the intended `307` root redirect to `/dashboard`.                                    |
| Deployment artifact validator                 | Passed. Render Blueprint, Compose, Cloud Run, ECS, and Vercel topology parsed and met project invariants.                               |
| Shell syntax validation                       | Passed for production entrypoint, database, and PostgreSQL initialization scripts.                                                      |
| Docker build/Compose execution                | Not performed: the sandbox has no Docker binary.                                                                                        |

## Residual risks and required operator decisions

The hardened code is not a substitute for university authorization, domain ownership, merchant onboarding, data protection governance, or service-account provisioning. The following items must be completed before handling real personal, financial, or academic data.

| Priority | Required action                                                                                                                 | Why it remains operator-owned                                                               |
| -------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| P0       | Create platform secret-store records and real RS256/AES keys.                                                                   | No secure deployment can use development placeholders.                                      |
| P0       | Rehearse `docker-compose.prod.yml` on an environment with Docker, including a backup/restore test.                              | Docker was unavailable for this sandbox validation.                                         |
| P0       | Provision managed Postgres with pgvector and a role administrator able to grant `BYPASSRLS`.                                    | Provider/database governance and credentials are institution-specific.                      |
| P0       | Configure persistent Redis and operate one worker replica initially.                                                            | BullMQ durability and schedule singleton behavior depend on infrastructure scaling.         |
| P0       | Set exact frontend/API domains and verify CORS, cookies, login, payment webhooks, SMTP, and SMS in a controlled staging domain. | These depend on institution-owned identities and provider contracts.                        |
| P1       | Establish release backups, restore testing, log retention, queue-failure alerts, database/Redis alarms, and incident ownership. | These are production operating controls.                                                    |
| P1       | Replace the historical migration sequence with a reviewed baseline migration in a future maintenance release.                   | The compatibility script is a safe current bridge but must remain intentionally controlled. |

## Final conclusion

The codebase is now **deployment-ready for a controlled staging or production cutover**, subject to the P0 operational controls above. The recommended first persistent production topology is **Vercel for the web frontend plus Render, Cloud Run, or ECS for the API/worker with managed PostgreSQL and persistent Redis**. The deployment guide identifies exact commands, service boundaries, secret requirements, and acceptance checks.

No automatic public deployment was performed because it would require the university’s own cloud account, DNS, payment, email, database, and secret-store authorization.
