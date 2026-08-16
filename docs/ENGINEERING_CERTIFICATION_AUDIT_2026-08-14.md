# UniPortal ERP v24 — Certification & Engineering Audit

**Audit date:** 2026-08-14  
**Artifact:** `uniportal-erp-v24-certification-snapshot (3).zip`  
**Scope:** source, Prisma schema/migrations, backend/frontend contracts, CI/CD, infrastructure manifests, tests, security controls, external-integration readiness, and release evidence.

## Executive verdict

**Status: NOT CERTIFIED / NOT READY FOR PRODUCTION SIGN-OFF.**

The repository is a substantial pre-production ERP baseline with strong architecture, extensive domain coverage, RBAC/RLS design, audit controls, MFA, migrations, CI/CD and static contract checks. The archive itself explicitly acknowledges that archive-only review cannot establish a production PASS.

The most important blockers are executable-evidence gaps and two correctness issues found during this audit:

1. **No API E2E suite exists** under the configured `apps/api/test/e2e/**/*.e2e-spec.ts` path, so the production certification runner cannot reach its E2E gate.
2. **No database-backed integration suite exists** under `apps/api/test/integration`; the CI workflow previously used `--passWithNoTests`, which could silently pass an empty integration selector. This was changed in the audited working copy to fail closed.
3. **Report generation is not actually implemented.** The worker claims XLSX/CSV/PDF generation and S3 storage, but the source contains no renderer or upload implementation and previously produced a fake URL. The audited working copy now fails closed instead of recording a false COMPLETED report.
4. **Production seed could fall back to a known default administrator password.** The audited working copy now rejects production seeding when credentials are missing or the known default is used.
5. External integrations remain certification-dependent: payment gateways, object storage, JAMB/identity/O-Level verification, SMTP/SMS, and IPPIS/PenCom layouts.
6. Performance scripts exist, but their committed fixtures contain placeholders and the documented test-account seeding command is not present in the API package scripts.

## What passed in archive/static validation

- P5 static security-pattern audit: **PASS**
- P5 integration contract audit: **PASS**
- V19 UI/UX contract: **PASS**
- V20 frontend contract: **PASS**
- V21 migration contract: **PASS**
- V22 priority UI contract: **PASS**
- V23 shell contract: **PASS**
- V24 P0 primitive contract: **PASS**
- Deployment artifact validation: **PASS**
- `eval()` / `new Function()` intelligence-rule gate: **PASS**
- No private-key files or committed `.env` files were found; only `.env.example` files are present.

These are static/contract results only; they do not prove runtime correctness.

## Repository inventory

| Area | Observed |
|---|---:|
| Backend controllers | 28 |
| Prisma models | 116 |
| Prisma migrations | 27 |
| API/package unit specs | 24 |
| API E2E specs | 0 |
| API integration-test files | 0 |
| Next.js route pages | 31 |
| Files in apps/packages/infra/scripts/tests | 574 |

## Critical findings

### C1 — Production certification cannot currently complete
**Severity: BLOCKER**

`scripts/verify/production-certification.sh` requires dependency installation, Prisma validation, migrations, seed, type-check, tests, API E2E, Pact verification, security/deployment checks and a production build. The configured API E2E Jest matcher targets `apps/api/test/e2e/**/*.e2e-spec.ts`, but that directory is absent. The configured E2E suite intentionally uses `passWithNoTests: false`, so a genuine certification run will fail at this gate rather than proving certification.

**Required action:** implement and execute database-backed E2E tests covering authentication/MFA, authorization, admissions, registration, results, fees/payments, audit, privacy and representative cross-module workflows.

### C2 — Integration CI gate could silently pass without integration tests
**Severity: HIGH**

The original CI command used `--passWithNoTests` with `--testPathPattern=integration`, while the archive has no `apps/api/test/integration` suite. That means an empty integration selector could return success. The audited working copy adds an explicit presence gate and removes `--passWithNoTests`.

**Required action:** add actual integration tests before treating the CI gate as green.

### C3 — Report generation was a false-completion risk
**Severity: HIGH**

`apps/api/src/modules/reports/jobs/report-generation.processor.ts` described XLSX/CSV/PDF generation and S3 storage, but the implementation did not generate a file and previously stored a synthetic URL. Infrastructure does define a private S3 reports bucket, but application code did not connect the worker to it and no renderer dependency was present.

**Remediation applied in audited working copy:** the worker now fails with `REPORT_ARTIFACT_PIPELINE_NOT_CONFIGURED` rather than marking a report `COMPLETED` with a broken URL.

**Required action:** implement a real renderer for each advertised format, private S3 upload, presigned download URLs, retention/expiry, and tests for access control and failure/retry behavior.

### C4 — Production seed default credential fallback
**Severity: HIGH**

`apps/api/prisma/seed.ts` previously defaulted to `admin@uniportal.dev` / `Admin@123456!`. Even though the README warned operators to change it, a production seed should fail closed instead of relying on operator discipline.

**Remediation applied in audited working copy:** production seeding now requires explicit non-default `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` values.

### C5 — External provider certification remains outstanding
**Severity: HIGH before live enablement**

The repository correctly documents that Paystack/Remita, SMTP/SMS, object storage, IPPIS/PenCom, JAMB and identity/O-Level verification require environment-specific evidence. The source still contains TODOs or provider-dependent boundaries for several of these integrations.

**Required action:** perform sandbox/controlled-pilot certification and record configuration version, timestamp, inputs, results, approver and exceptions.

### C6 — Performance evidence is not executable from the clean archive alone
**Severity: HIGH for NFR sign-off**

The k6 scenarios exist, but the documentation states that committed fixtures contain `REPLACE_WITH_*` placeholders and references `seed:k6-test-students`, which is not present in `apps/api/package.json`.

**Required action:** implement environment-safe performance data seeding, generate test tokens/fixtures, run J1/J2/J3 plus general read/write against staging, and preserve result artifacts.

## Security review

### Strengths

- Global JWT authentication guard with explicit `@Public()` exceptions.
- Role-based access control plus staff-scope/ABAC mechanisms.
- PostgreSQL RLS migrations and a dedicated application/system-role split.
- MFA with encrypted TOTP secret and backup-code hashing.
- Refresh-token rotation and session revocation paths.
- Throttling for authentication and selected sensitive endpoints.
- Helmet/security headers and explicit CORS origin configuration.
- AES-256-GCM PII encryption with key-versioning support documented in the repository.
- Audit logging is present across security-sensitive flows.
- Static audit rejects dynamic `eval()`/`new Function()` patterns in intelligence rules.
- Payment initiation has an idempotency-key contract and webhook raw-byte/signature boundaries.

### Security items requiring runtime evidence

- RLS must be exercised as the restricted application role, not only as migration owner/superuser.
- Authorization matrix needs automated negative tests across all privileged domains.
- Concurrent payment, registration and grading scenarios require database-backed tests.
- Backup/restore and disaster-recovery procedures need an executed drill, not just scripts/runbooks.
- Secrets, bucket policies, KMS configuration, WAF/ALB behavior and production IAM require cloud-environment verification.

## Academic/data-integrity review

The schema is broad and includes 116 models covering admissions, students, curriculum, registration, assessment, examinations, results, fees, HR/payroll, library, hostel, LMS, clinic, transport, research, alumni, reporting, privacy and security.

The changelog documents several academic-integrity hardening changes: canonical result attempts, repeat-course ordering, registration/offering/semester/lecturer validation, fail-closed degree-audit thresholds, controlled RLS changes and admissions reference-data normalization.

**Still required:** executable grading vectors, repeat-course scenarios, senate-publish/CGPA recalculation evidence, concurrent registration/fee tests, graduation eligibility cases, and restore-from-backup validation.

## Frontend review

The archive contains a substantial Next.js App Router frontend with dashboard domains and explicit V19–V24 UI contracts. Static contract checks for V19–V24 all pass.

**Runtime UI evidence remains outstanding:** browser E2E, accessibility execution, responsive viewport checks, real API data flows, error/loading/empty states, and role-specific navigation must be captured in a staging environment.

## CI/CD review

Strengths include locked dependency installation, Node 22 alignment, static security scanning, Terraform validation, rolling/blue-green deployment paths, health checks, manual production environment approval, and DR validation workflow.

The principal CI weakness was the empty integration-test selector. The audited working copy now fails closed on absence of integration tests.

## Certification matrix

| Gate | Status | Evidence |
|---|---|---|
| Source/static security | PASS | P5 static audit |
| Frontend contract | PASS | V19–V24 contract scripts |
| Deployment artifact structure | PASS | validation script |
| Prisma/runtime schema | UNVERIFIED | pnpm unavailable in audit environment |
| TypeScript build | UNVERIFIED | dependency installation unavailable |
| Unit tests | UNVERIFIED | dependencies unavailable |
| Integration tests | BLOCKED | suite absent |
| API E2E | BLOCKED | suite absent |
| Pact verification | UNVERIFIED | dependencies/runtime unavailable |
| RLS runtime isolation | UNVERIFIED | requires PostgreSQL execution |
| Payment sandbox | UNVERIFIED | provider credentials/evidence required |
| Report artifacts | BLOCKED | renderer/storage implementation absent; now fail-closed |
| Performance/NFR | BLOCKED | real staging data/tokens required |
| Backup/restore drill | UNVERIFIED | execution evidence required |
| DR failover drill | UNVERIFIED | controlled cloud exercise required |
| Production sign-off | **NO-GO** | mandatory evidence gaps |

## Recommended execution order

1. Install Node 22 + pnpm 9.15 in a controlled build environment.
2. Run `pnpm install --frozen-lockfile`.
3. Run Prisma validation/generation and a clean PostgreSQL migration deployment.
4. Add and execute integration tests as the restricted `uniportal_app` role.
5. Add and execute API E2E tests; make the production certification script green without `passWithNoTests` loopholes.
6. Implement real report rendering/storage before enabling report downloads.
7. Complete payment, messaging, identity/O-Level and admissions provider sandbox certification.
8. Execute k6 staging scenarios with real seeded test fixtures.
9. Execute backup/restore and DR exercises and retain evidence.
10. Run the full production-certification script and archive its logs/artifacts.
11. Only then issue an institutional production readiness sign-off.

## Important distinction

This audit is an engineering certification/readiness assessment of the supplied source snapshot. It is **not** NUC accreditation, ISO certification, NDPC approval, payment-provider certification, or any other regulatory certification.
