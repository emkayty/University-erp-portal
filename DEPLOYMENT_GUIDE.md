# UniPortal ERP Deployment Guide

**Release line:** V43 deployment-ready source tree

**Audience:** University platform administrators, DevOps engineers, security owners, and developers preparing a localhost or staging environment.

UniPortal is a monorepo containing a NestJS API, a Next.js web application, a PostgreSQL database with `pgvector`, Redis/BullMQ infrastructure, and a dedicated worker process. The production topology is intentionally split: API replicas serve HTTP, one durable worker consumes queues and scheduled work, one schema job applies the database baseline, and the web application serves the browser.

> **Deployment invariant:** Never run the worker as an unbounded API replica, never run schema deployment on every API instance, and never expose the database or Redis services publicly.

## 1. Environment options

The repository supports several deployment patterns. Choose the smallest pattern that satisfies the operational requirement.

| Environment | Recommended topology | Best use | Main constraint |
| --- | --- | --- | --- |
| 2015 MacBook Air localhost | Docker PostgreSQL/Redis plus native Node API, worker, and web | Local development and administrator acceptance testing | Limited RAM; do not run all services in Docker |
| Standard development workstation | `docker-compose.yml` infrastructure, optional admin tools, native or containerized application | Team development and integration work | Admin tools are development-only |
| Docker Compose production-like | `docker-compose.prod.yml` with API, worker, web, schema job, PostgreSQL, Redis | Single-host staging, private VPS, institutional server | Requires persistent volumes, TLS/reverse proxy, backups, and secrets management |
| Render backend plus Vercel web | Managed PostgreSQL/Redis, Render API and worker, Vercel Next.js | Low-operations hosted deployment | Worker must remain a singleton and web API URL is a build-time value |
| Google Cloud Run | API and web services plus singleton worker, Cloud SQL, Memorystore, Secret Manager | Managed container deployment | Worker requires retained CPU and singleton scaling |
| AWS ECS/Fargate | API, worker, and web services, RDS PostgreSQL, ElastiCache/MemoryDB, Secrets Manager | AWS-native production deployment | Requires IAM, networking, ALB, logs, and service configuration |
| Generic Docker/VPS | The two Dockerfiles with a managed or private PostgreSQL/Redis pair | Any Docker-capable platform | Platform operator owns TLS, backups, monitoring, and restart policy |

WebDev-style managed hosting is not the direct deployment target for this existing Docker/Prisma monorepo. The project already has portable container and platform manifests; use those artifacts rather than attempting to convert the system into a different runtime model.

## 2. Runtime and service contract

The supported runtime is Node.js 22.x with pnpm 9.15.x. The API image and web image use Node 22 and compile the workspace packages before starting the production processes.

| Process | Image or command | Port | Role |
| --- | --- | --- | --- |
| API | `apps/api/Dockerfile`, `/app/scripts/start-api.sh` | 3001 | HTTP API, authentication, business operations |
| Worker | API image, `/app/scripts/start-worker.sh` | Internal health listener if enabled | BullMQ processors and scheduled work; keep one replica initially |
| Web | `apps/web/Dockerfile` | 3000 | Next.js standalone browser application |
| Schema job | API image, `/app/scripts/db/deploy-schema.sh` | None | One-off PostgreSQL extension, schema, role, and RLS baseline |
| PostgreSQL | `pgvector/pgvector:pg16` | 5432 private | Persistent relational data and vector extension |
| Redis | `redis:7-alpine` or managed Redis | 6379 private | Persistent BullMQ queues, cache, and worker coordination |

The worker must not be scaled horizontally until scheduled-work locking and duplicate execution behavior have been explicitly designed and tested. The API may scale horizontally behind an HTTPS load balancer.

## 3. Database and schema deployment rules

The historic Prisma migration chain is not a safe fresh-database baseline for this release line. The supported deployment path is `scripts/db/deploy-schema.sh`, which uses non-destructive `prisma db push`, prepares required extensions, and applies role grants and RLS hardening. It deliberately refuses `prisma migrate deploy`.

> **Never add `--accept-data-loss` to the release workflow.** A destructive schema diff is a database change project requiring backup, review, staging rehearsal, and an explicit migration decision.

The database uses separate identities:

| Identity | Use | Rule |
| --- | --- | --- |
| Owner/admin | Schema DDL, extensions, roles, and RLS policies | Deploy-time only; never use as the normal application identity |
| `uniportal_app` | Normal API and worker Prisma traffic | Restricted runtime role with RLS enforcement |
| `uniportal_system` | Direct system operations such as advisory-lock-backed allocation | Separate direct connection with the system privileges required by that operation |

Run the schema job once before starting or scaling the API:

```bash
export DATABASE_URL='postgresql://uniportal_app:APP_PASSWORD@db-host:5432/uniportal'
export DATABASE_DIRECT_URL='postgresql://uniportal_system:SYSTEM_PASSWORD@db-host:5432/uniportal'
export MIGRATE_DATABASE_URL='postgresql://OWNER:OWNER_PASSWORD@db-host:5432/uniportal'
export SCHEMA_DEPLOYMENT_MODE=push
bash scripts/db/deploy-schema.sh
```

For a new environment, the owner connection must be capable of creating the required extensions and roles. If a managed provider disallows `CREATE ROLE`, `BYPASSRLS`, or the required PostgreSQL extensions, use a compatible PostgreSQL service or involve the institutional DBA before deployment.

## 4. Environment and secret contract

Use `.env.example` as the complete reference. `apps/api/.env.example` is the API-focused subset. Do not commit populated `.env` files, private keys, passwords, payment keys, SMTP credentials, or object-storage credentials.

| Group | Important variables |
| --- | --- |
| Runtime | `NODE_ENV`, `PROCESS_ROLE`, `API_PORT`, `API_PREFIX`, `LOG_LEVEL` |
| Database | `DATABASE_URL`, `DATABASE_DIRECT_URL`, deploy-time `MIGRATE_DATABASE_URL`, optional `REPORTING_DATABASE_URL` |
| Redis | `REDIS_URL` or `REDIS_HOST`/`REDIS_PORT`/`REDIS_PASSWORD`/`REDIS_TLS` |
| Authentication | `JWT_PRIVATE_KEY_B64`, `JWT_PUBLIC_KEY_B64`, token TTLs |
| Privacy | Stable `ENCRYPTION_KEY_HEX`; optional stable `NDPR_PSEUDONYM_SALT` |
| Browser/CORS | `NEXT_PUBLIC_API_URL` at web build time and exact `FRONTEND_ORIGIN` at API runtime |
| Object storage | `AWS_REGION`, `S3_ENDPOINT_URL`, `S3_FORCE_PATH_STYLE`, and the three bucket names |
| Messaging | SMTP or SES-compatible settings, optional Termii settings |
| Payments | Provider keys, webhook secrets, explicit verification endpoints, and timeout |
| Reliability | Trust-proxy settings, request/query limits, report row ceiling, and shutdown timeout |

MFA is database-backed rather than environment-flag-backed. TOTP secrets and backup codes are encrypted with `ENCRYPTION_KEY_HEX`, while mandatory-role policy is stored in institution settings. Keep the encryption key stable and backed up before enabling mandatory MFA roles.

## 5. Localhost on a 2015 MacBook Air

Use [MACBOOK_LOCALHOST_QUICKSTART.md](MACBOOK_LOCALHOST_QUICKSTART.md). The lightweight profile is `docker-compose.local.yml` and contains only PostgreSQL and Redis. It uses `pgvector/pgvector:pg16`, named persistent volumes, health checks, and conservative memory/CPU limits. Run the API, worker, and web application natively with pnpm.

```bash
docker compose -f docker-compose.local.yml up -d
pnpm install --frozen-lockfile
pnpm db:generate
set -a; source .env; set +a
bash scripts/db/deploy-schema.sh
POSTGRES_CONTAINER=uniportal_postgres_local pnpm db:bootstrap-roles
```

Then use three terminals:

```bash
pnpm --filter @uniportal/api dev
PROCESS_ROLE=worker pnpm --filter @uniportal/api dev
pnpm --filter @uniportal/web dev
```

The web browser uses `http://localhost:3001` as `NEXT_PUBLIC_API_URL`, and the API uses `http://localhost:3000` as `FRONTEND_ORIGIN`. Do not use the production Compose profile on this laptop unless you are deliberately rehearsing a container release on a stronger machine.

## 6. Standard development Compose

`docker-compose.yml` provides PostgreSQL and Redis, with pgAdmin and Redis Commander behind the `tools` profile. Start only infrastructure for ordinary development:

```bash
docker compose -f docker-compose.yml up -d postgres redis
```

Start optional admin tools only when needed:

```bash
docker compose -f docker-compose.yml --profile tools up -d
```

The standard profile is heavier than the MacBook profile. It is suitable for a workstation with additional memory. The tools must never be exposed on a production network.

## 7. Single-host production-like Docker Compose

Use `docker-compose.prod.yml` for a private VPS, institutional server, or staging host. It includes PostgreSQL with pgvector, authenticated Redis, API, worker, web, and a maintenance-only schema service.

Create a secret file outside Git, for example `.env.production`, and populate at least:

```dotenv
NODE_ENV=production
POSTGRES_PASSWORD=<strong-owner-password>
POSTGRES_APP_PASSWORD=<strong-app-password>
POSTGRES_SYSTEM_PASSWORD=<strong-system-password>
REDIS_PASSWORD=<strong-redis-password>
JWT_PRIVATE_KEY_B64=<base64-private-key>
JWT_PUBLIC_KEY_B64=<base64-public-key>
ENCRYPTION_KEY_HEX=<64-hex-character-key>
FRONTEND_ORIGIN=https://portal.example.edu
NEXT_PUBLIC_API_URL=https://api.example.edu
SMTP_FROM=verified@example.edu
```

Deploy the database and schema first, then application services:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres redis
docker compose --env-file .env.production -f docker-compose.prod.yml --profile maintenance run --rm schema
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build api worker web
curl -fsS https://api.example.edu/api/health/live
```

Place the Compose host behind an HTTPS reverse proxy such as Caddy, Nginx, Traefik, or a managed load balancer. Publish only the web and API ports. Keep PostgreSQL, Redis, and the worker on the private network. Configure host-level backups and test restoration before accepting institutional data.

The database initialization hook runs only when the PostgreSQL volume is first created. Do not delete that volume to replay initialization. Use an explicit backup and maintenance procedure instead.

## 8. Render backend and Vercel frontend

The root `render.yaml` provides a managed PostgreSQL database, managed Redis/Key Value, a Docker API service, and a Docker worker. Create a Render Blueprint from the repository root, review every prompted secret, and keep the worker at one instance initially. Run the schema deployment as the controlled pre-deploy or one-off maintenance operation before enabling the public web application.

Deploy `apps/web` separately to Vercel as a monorepo project. Set the project root to `apps/web`, preserve `apps/web/vercel.json`, and set `NEXT_PUBLIC_API_URL` to the final HTTPS API origin before each build. After the web domain is final, set the API’s `FRONTEND_ORIGIN` to that exact origin and verify login, refresh cookies, protected requests, CORS, and webhooks.

The frontend may be hosted on Vercel, but the API and durable worker must remain on Render or another service that supports long-running processes. Do not convert the worker into a serverless function.

## 9. Google Cloud Run

The `infra/gcp/` directory contains API, worker, and web manifests. Build the API image and web image separately because `NEXT_PUBLIC_API_URL` is a web-image build argument:

```bash
docker build -f apps/api/Dockerfile \
  -t REGION-docker.pkg.dev/PROJECT/REPOSITORY/uniportal-api:TAG .
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.example.edu \
  -f apps/web/Dockerfile \
  -t REGION-docker.pkg.dev/PROJECT/REPOSITORY/uniportal-web:TAG .
docker push REGION-docker.pkg.dev/PROJECT/REPOSITORY/uniportal-api:TAG
docker push REGION-docker.pkg.dev/PROJECT/REPOSITORY/uniportal-web:TAG
```

Use Cloud SQL for PostgreSQL, Memorystore or another persistent private Redis service, and Secret Manager for database URLs, Redis credentials, JWT material, encryption keys, SMTP credentials, and provider secrets. Run the schema image as a controlled Cloud Run Job or CI task. Keep the worker singleton with retained CPU and internal ingress; it is a durable queue consumer, not a short-lived request handler.

## 10. AWS ECS/Fargate

The `infra/aws/` directory contains API, worker, and web task definitions. Build and push the API and web images to ECR, replace account/region/tag placeholders, and store secrets in AWS Secrets Manager. Use RDS PostgreSQL with the required extensions and ElastiCache/MemoryDB Redis in private subnets. Run schema deployment as a one-off ECS task or CI job with the owner connection.

Place the API behind an HTTPS Application Load Balancer with `/api/health/live` as the target health check. Run the worker as a service with desired count one. Configure CloudWatch logs and alerting for API failures, worker restarts, Redis memory pressure, queue failures, and database health. Do not set `RUN_DB_SCHEMA=true` on continuously scaled API tasks.

## 11. Generic Docker platform or private VPS

Any platform that accepts OCI/Docker images can use the two Dockerfiles. Build the API image once and run it with separate commands:

```bash
# API HTTP process
/app/scripts/start-api.sh

# Durable queue worker
/app/scripts/start-worker.sh
```

Build the web image with the final browser-facing API origin:

```bash
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.example.edu \
  -f apps/web/Dockerfile -t uniportal-web:release .
```

Run PostgreSQL and Redis as managed services where possible. If they run on the same host, keep them on a private Docker network with persistent volumes and authenticated Redis. Use a reverse proxy for TLS, configure restart policies, centralize logs, and schedule encrypted database backups. The schema script is a release job, not a container health check.

## 12. Release packaging

The repository includes `scripts/package-release.sh`. It excludes `.git`, dependencies, Turbo caches, Next output, `dist`, coverage, browser results, artifacts, source maps, TypeScript build metadata, logs, temporary files, and populated environment files while preserving `.env.example` templates.

```bash
bash scripts/package-release.sh /path/to/uniportal-erp-deployment-ready.zip
sha256sum -c /path/to/uniportal-erp-deployment-ready.zip.sha256
```

Run packaging only after source validation. Do not package `node_modules`, `.turbo`, `.next`, or production secrets. Turbo caching belongs in CI or a remote cache; it does not belong in a source release archive.

## 13. Pre-deployment validation

From a clean checkout:

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm install --frozen-lockfile
pnpm type-check
pnpm turbo run test --concurrency=1
pnpm lint
pnpm build
```

Validate Compose syntax without starting services:

```bash
docker compose -f docker-compose.local.yml config --quiet
docker compose -f docker-compose.yml config --quiet
docker compose --env-file .env.production -f docker-compose.prod.yml config --quiet
```

On the target platform, complete a separate runtime rehearsal for database schema deployment, API liveness, web assets, authentication, MFA setup/verification, worker queue processing, private object-storage presigning, email delivery, and payment webhook verification.

## 14. Production acceptance controls

| Control | Acceptance criterion |
| --- | --- |
| Domains and TLS | University-owned HTTPS web/API domains, no mixed content, certificate renewal tested |
| CORS and cookies | Exact `FRONTEND_ORIGIN`, login/refresh/logout tested on the final domain |
| Database | Backups enabled, restoration rehearsed, pgvector available, restricted roles and RLS baseline verified |
| Redis and worker | Persistent Redis, authenticated connection, exactly one worker initially, failed jobs monitored |
| Secrets | Platform secret manager used; no development keys or populated `.env` files in images or archives |
| MFA | Mandatory roles configured, setup and backup-code recovery tested, encryption key backed up |
| Storage | Separate uploads/reports/static buckets, private objects presigned, endpoint/path-style settings verified |
| Payments and messaging | Provider test/live callbacks verified, SMTP sender approved, SMS provider validated if enabled |
| Observability | API liveness monitoring, logs, queue alerts, database/Redis alarms, incident ownership assigned |

## References

[1]: https://docs.docker.com/compose/ "Docker Compose documentation"
[2]: https://render.com/docs/blueprint-spec "Render Blueprint specification"
[3]: https://vercel.com/docs/monorepos "Vercel monorepo documentation"
[4]: https://cloud.google.com/run/docs/deploying "Google Cloud Run deployment documentation"
[5]: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/Welcome.html "Amazon ECS documentation"
