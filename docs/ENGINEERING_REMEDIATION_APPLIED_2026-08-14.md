# UniPortal ERP v24 — Engineering Remediation Applied

**Date:** 2026-08-14
**Baseline:** `uniportal-erp-v24-audited.zip`

## Executive result

The archive-level findings have been converted into implemented code, CI gates, test suites, runtime tooling, and fail-closed certification controls wherever the repository can control the outcome.

The project is **not falsely marked production-certified**. Cloud/provider drills still require execution in the target environment and signed evidence; the production certification runner now refuses to sign off without that evidence.

## Implemented remediations

### 1. API E2E gate

Added `apps/api/test/e2e/auth-security.e2e-spec.ts` covering:

- public liveness;
- unauthenticated access rejection;
- invalid credential behavior;
- DTO whitelist enforcement.

The existing E2E configuration remains `passWithNoTests: false`.

### 2. Database integration/RLS gate

Added `apps/api/test/integration/rls-database.integration.spec.ts` and a dedicated Jest configuration.

The suite verifies:

- connection as `uniportal_app`;
- `FORCE ROW LEVEL SECURITY` on protected tables;
- zero student visibility without request identity;
- transaction-local RLS context isolation.

CI now executes the dedicated integration configuration rather than an empty path selector.

### 3. Fresh-database CI deployment path

CI no longer invokes the historical `prisma migrate deploy` chain as the fresh-database test path. It now uses `scripts/db/deploy-schema.sh`, the same controlled non-destructive schema/RLS deployment path used by certification.

The restricted application and system roles are explicitly bootstrapped in the ephemeral PostgreSQL environment.

### 4. Real report artifact pipeline

Implemented `ReportArtifactService` with:

- CSV rendering;
- XLSX OpenXML generation;
- PDF generation;
- row flattening for nested report data;
- configured export row limits;
- private S3 upload;
- AWS SigV4 signing;
- presigned 30-minute download URLs;
- AWS container/EC2 workload-identity credential resolution;
- local owner-only artifact fallback for development/test;
- production/staging fail-closed behavior when S3 storage is absent.

Added an authenticated `/api/v1/reports/jobs/:id/download` endpoint for local development artifacts and S3 redirects.

Report workers now query the configured reporting read replica and only mark jobs `COMPLETED` after artifact generation and storage succeed.

### 5. Production seed hardening

Production seeding already required explicit administrator credentials; this remediation preserves the fail-closed rule and rejects the known `Admin@123456!` default.

### 6. Performance test fixtures

Added `scripts/k6/seed-test-students.ts` and `seed:k6-test-students`.

The seeder:

- refuses production;
- creates isolated test users, roles, persons and students;
- links them to an existing active programme/curriculum;
- generates short-lived RS256 tokens;
- writes generated fixtures only at test time;
- never commits credentials or tokens.

CI's scheduled/manual k6 job now installs dependencies, seeds staging fixtures and executes all scenarios.

### 7. Reporting environment wiring

`REPORTING_DATABASE_URL` is now the canonical reporting connection environment variable, with `PRISMA_REPORTING_URL` retained as a compatibility alias.

### 8. Provider certification gate

Added `scripts/verify/external-provider-certification.sh`.

It performs a read-only Paystack credential/endpoint check, verifies the configured Remita endpoint is reachable, and requires explicit approval after the real sandbox payment/webhook/reconciliation lifecycle has been executed.

No live-money transaction is created by the gate.

### 9. Runtime evidence gate

Added `scripts/verify/runtime-certification-evidence.sh`.

Production certification now requires PASS evidence for:

- restricted-role RLS runtime validation;
- backup/restore drill;
- DR failover/failback drill;
- k6 performance evidence;
- browser E2E/accessibility evidence.

This prevents source inspection from being misrepresented as operational certification.

### 10. Certification runner integration

`scripts/verify/production-certification.sh` now runs:

1. locked dependency installation;
2. Prisma/schema validation;
3. controlled database deployment and RLS hardening;
4. secure seed;
5. type verification;
6. unit/contract tests;
7. integration tests;
8. API E2E and Pact verification;
9. security/deployment checks;
10. production build;
11. external-provider and runtime-evidence gates.

## Verification performed in this environment

The following checks were executed successfully against the source tree available in this sandbox:

- TypeScript syntax/transpilation checks for all newly modified TypeScript files — **PASS**
- P5 static security-pattern audit — **PASS**
- P5 integration contract audit — **PASS**
- Deployment artifact validation — **PASS**
- Shell syntax validation for certification/evidence scripts — **PASS**

## Verification not possible in this environment

The sandbox has Node 22 and TypeScript but no installed pnpm, PostgreSQL client/server, Docker runtime, Redis, cloud credentials, provider sandbox credentials, browser runtime, or k6 binary. Network access to the npm registry is also unavailable.

Therefore the following must still be executed on CI/staging:

- `pnpm install --frozen-lockfile`
- Prisma generation/type-check
- database migration/schema deployment against PostgreSQL
- integration/E2E runtime tests
- Pact verification
- real report upload/download against private S3
- Paystack/Remita sandbox lifecycle
- SMTP/SMS delivery tests
- RLS cross-user runtime matrix
- k6 J1/J2/J3/general scenarios
- backup/restore drill
- DR failover/failback drill
- browser accessibility/responsive evidence

## Certification position

**Engineering remediation: APPLIED.**

**Production certification: PENDING REQUIRED RUNTIME EVIDENCE.**

The repository is deliberately fail-closed: it will not claim production certification merely because the source now contains the required mechanisms.
