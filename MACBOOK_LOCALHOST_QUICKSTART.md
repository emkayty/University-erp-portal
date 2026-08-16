# UniPortal ERP on a 2015 MacBook Air

This guide describes the supported localhost profile for a 2015 Intel MacBook Air with approximately 4–8 GB of RAM. The profile deliberately runs only PostgreSQL and Redis in Docker and runs the NestJS API, BullMQ worker, and Next.js frontend as native Node.js processes. This avoids running four application containers and two administrative containers inside a constrained Docker Desktop VM.

> **Supported local toolchain:** Node.js 22.x, pnpm 9.15.x, Docker Desktop with Docker Compose v2, and an Intel-compatible macOS release supported by the installed Docker Desktop version.

## 1. Resource expectations

Close memory-heavy applications before starting the stack. In Docker Desktop, allocate approximately **3 GB of RAM** to Docker if the machine has 8 GB total; on a 4 GB machine, use the smallest practical allocation and start only PostgreSQL and Redis. Do not start pgAdmin, Redis Commander, Playwright, or production Compose services during ordinary development.

| Component | Where it runs | Local resource intent |
| --- | --- | --- |
| PostgreSQL 16 | Docker | Capped at approximately 768 MB |
| Redis 7 | Docker | Capped at approximately 192 MB |
| NestJS API | Native Node.js | Port 3001 |
| BullMQ worker | Native Node.js | One process only |
| Next.js web | Native Node.js | Port 3000 |

## 2. Install prerequisites

Install Docker Desktop for Mac with Intel support and confirm that the Compose v2 command is available. Install the PostgreSQL client only if `psql` is not already present; the database server itself remains inside Docker:

```bash
brew install libpq
echo 'export PATH="/opt/homebrew/opt/libpq/bin:/usr/local/opt/libpq/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
```

Then verify the Compose and client commands:

```bash
docker --version
docker compose version
```

Install Node.js 22 with `nvm` if possible. On an older macOS installation, use an `nvm` release and Node.js 22 binary that the operating system supports; do not use Node 16, 18, or 20 for this repository.

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.nvm/nvm.sh
nvm install 22
nvm use 22
node --version
```

Activate the lockfile-compatible pnpm version through Corepack:

```bash
corepack enable
corepack prepare pnpm@9.15.0 --activate
pnpm --version
```

If Corepack is unavailable in the installed Node distribution, install pnpm 9.15.0 through the package manager instead:

```bash
npm install --global pnpm@9.15.0
```

## 3. Obtain and configure the source

From the repository root:

```bash
cp .env.example .env
```

Generate local cryptographic material. These values are for localhost only and must never be reused in production:

```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out /tmp/uniportal-private.pem
openssl rsa -pubout -in /tmp/uniportal-private.pem -out /tmp/uniportal-public.pem
export JWT_PRIVATE_KEY_B64="$(base64 < /tmp/uniportal-private.pem | tr -d '\n')"
export JWT_PUBLIC_KEY_B64="$(base64 < /tmp/uniportal-public.pem | tr -d '\n')"
export ENCRYPTION_KEY_HEX="$(openssl rand -hex 32)"
printf '%s\n' "$JWT_PRIVATE_KEY_B64"
printf '%s\n' "$JWT_PUBLIC_KEY_B64"
printf '%s\n' "$ENCRYPTION_KEY_HEX"
```

Copy the generated values into `.env`, then set the local database and browser values as follows:

```dotenv
NODE_ENV=development
PROCESS_ROLE=api
DATABASE_URL=postgresql://uniportal_app:CHANGE_ME@localhost:5432/uniportal_dev
DATABASE_DIRECT_URL=postgresql://uniportal_system:CHANGE_ME@localhost:5432/uniportal_dev
MIGRATE_DATABASE_URL=postgresql://uniportal:uniportal_dev_pass@localhost:5432/uniportal_dev
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false
NEXT_PUBLIC_API_URL=http://localhost:3001
FRONTEND_ORIGIN=http://localhost:3000
API_PREFIX=api/v1
S3_FORCE_PATH_STYLE=true
LOG_LEVEL=debug
```

The local storage bucket values may remain as example names when object-storage features are not being exercised. Set an S3-compatible endpoint and credentials when testing uploads or report downloads. MFA is database-backed; its secrets and backup codes are protected by `ENCRYPTION_KEY_HEX`, so keep that local key stable while using the local database.

## 4. Start lightweight infrastructure

Start only the local PostgreSQL and Redis services:

```bash
docker compose -f docker-compose.local.yml up -d
docker compose -f docker-compose.local.yml ps
```

Wait until both health checks are healthy:

```bash
docker inspect --format '{{.State.Health.Status}}' uniportal_postgres_local
docker inspect --format '{{.State.Health.Status}}' uniportal_redis_local
```

The first database initialization creates `uniportal_dev`, `uniportal_test`, and the required PostgreSQL extensions. The restricted application roles are established by the schema/bootstrap workflow rather than by the initial SQL file.

## 5. Install and prepare the monorepo

Install exactly from the lockfile and generate Prisma clients:

```bash
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:validate
```

Apply the non-destructive local schema and create the restricted local roles:

```bash
set -a; source .env; set +a
bash scripts/db/deploy-schema.sh
POSTGRES_CONTAINER=uniportal_postgres_local pnpm db:bootstrap-roles
```

The direct form of the same controlled schema workflow is:

```bash
export DATABASE_URL='postgresql://uniportal:uniportal_dev_pass@localhost:5432/uniportal_dev'
export MIGRATE_DATABASE_URL="$DATABASE_URL"
export DATABASE_DIRECT_URL="$DATABASE_URL"
export SCHEMA_DEPLOYMENT_MODE=push
bash scripts/db/deploy-schema.sh
POSTGRES_CONTAINER=uniportal_postgres_local pnpm db:bootstrap-roles
```

Do not add `--accept-data-loss`. If Prisma reports a destructive diff, stop and review it instead of forcing the command.

Optional local reference data and an administrator can be seeded with explicitly supplied test credentials:

```bash
export SEED_ADMIN_EMAIL=admin@example.test
export SEED_ADMIN_PASSWORD='ChangeThisLocalOnly!123'
pnpm db:seed
```

## 6. Run the application natively

Open three Terminal tabs from the repository root.

**Tab 1 — API:**

```bash
pnpm --filter @uniportal/api dev
```

**Tab 2 — worker:**

```bash
PROCESS_ROLE=worker pnpm --filter @uniportal/api dev
```

**Tab 3 — web:**

```bash
pnpm --filter @uniportal/web dev
```

Alternatively, use `pnpm dev` if the machine has sufficient memory and you want Turbo to start the services in parallel. On a 4 GB MacBook Air, the three-tab approach is preferable because it makes it possible to stop the worker or web process independently.

## 7. Verify localhost

```bash
curl -fsS http://localhost:3001/api/health/live
curl -I http://localhost:3000
```

Open [http://localhost:3000](http://localhost:3000). The browser API URL must be the same origin configured in `NEXT_PUBLIC_API_URL`; because that value is embedded during the Next.js build, restart the web process after changing it.

## 8. Stop and reset commands

Stop native processes with `Ctrl+C`, then stop infrastructure:

```bash
docker compose -f docker-compose.local.yml down
```

To remove all local database and Redis data and start again from an empty state, use the destructive command only when you intend to lose local data:

```bash
docker compose -f docker-compose.local.yml down -v
```

Do not use `down -v` against production or shared development databases.

## 9. Troubleshooting on older Intel Macs

If Docker becomes unresponsive, stop the application processes first, then run `docker system prune` only after checking that no other projects depend on the unused images or volumes. If PostgreSQL fails to start, check that ports 5432 and 6379 are not already occupied with `lsof -nP -iTCP:5432 -sTCP:LISTEN` and `lsof -nP -iTCP:6379 -sTCP:LISTEN`.

If the Node process is killed or the machine swaps heavily, stop the worker during frontend work, lower Docker Desktop memory pressure by closing unused containers, and avoid Playwright or production image builds on the laptop. Build and browser-test in CI or on a stronger machine when necessary.

If the local database was initialized with incompatible credentials, remove only the local profile volume and recreate it:

```bash
docker compose -f docker-compose.local.yml down -v
docker compose -f docker-compose.local.yml up -d
```

## 10. Local readiness checklist

| Check | Expected result |
| --- | --- |
| `node --version` | `v22.x` |
| `pnpm --version` | `9.15.x` |
| `docker compose version` | Compose v2 available |
| PostgreSQL health | `healthy` |
| Redis health | `healthy` |
| API liveness | HTTP 200 from `/api/health/live` |
| Web page | HTTP 200 from port 3000 |
| Worker | Exactly one local worker process when queue features are tested |
| Secrets | Local-only values in ignored `.env`, never committed |
