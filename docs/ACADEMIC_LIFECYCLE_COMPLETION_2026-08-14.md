# UniPortal ERP v24 — Academic Lifecycle Completion

Date: 2026-08-14

## Implemented

This pass converts the academic-domain recommendations into an integrated application layer instead of leaving them as isolated pure functions.

### Academic intelligence / progression
- Added `AcademicModule` with authenticated student and authorized staff APIs.
- Added persisted degree-audit snapshots using the existing deterministic academic-domain engine.
- Added persisted progression evaluations and official academic-standing records.
- Added academic placement history so level changes are decisions rather than `level++` mutations.
- Added period credit-unit and failed-course fields to `StudentAcademicHistory` so progression is based on period evidence rather than cumulative cache fields.

### Curriculum governance
- Added curriculum requirement groups and requirement records for core/elective/basket-style degree structures.
- Preserved curriculum-version ownership so historical cohorts remain tied to their assigned version.
- Added course equivalency records for renamed/replaced courses.

### Exceptions and mobility
- Added academic exemptions/waivers with approval/evidence fields.
- Added transfer-credit records with provenance and approval status.
- Added programme-transfer requests.
- Added academic interruption records for deferment/leave/other approved interruptions.
- Added academic appeals.

### Student planning
- Added persisted academic plans and ordered plan items.
- Degree-audit execution now creates a new active plan from remaining curriculum courses and supersedes the previous plan.
- The plan is explicitly advisory/recommended and does not silently change official academic status.

### Credentials
- Added a credential ledger for transcript/certificate/statement-style artifacts with unique credential numbers, snapshot and revocation state.

### Registration hardening
- Carryover courses are now valid registration candidates when they belong to the student's assigned curriculum and are currently offered; registration is no longer limited to the current level's curriculum rows.
- Prerequisite checks now enforce the configured minimum prerequisite grade instead of merely checking for any non-F result.
- Existing transaction/advisory-lock/unique-constraint protections remain intact.

### Student experience
- Added `/dashboard/academic` as the student-facing Academic Journey command center.
- It surfaces curriculum identity, progress, CGPA, credits, outstanding courses, degree-audit state, current courses and academic history without fabricating unavailable data.

## Business invariants added by design

1. Published results remain the authoritative evidence for degree audit.
2. Degree audits store their computed snapshot and policy/curriculum provenance.
3. Academic standing is rule-based and separate from predictive/AI risk signals.
4. Academic plans do not mutate official results, standing or progression.
5. Course equivalencies are explicit records rather than hidden matching logic.
6. Transfer credits and exemptions retain distinct provenance and approval status.
7. Programme transfers cannot be self-transfers.
8. Academic interruptions cannot have an end date before the start date.
9. Credential numbers are unique and credentials can be revoked without deleting history.
10. Carryover registration is supported without weakening curriculum membership checks.

## Verification performed

- Source inspection of the existing academic-domain engine and student registration service.
- Static TypeScript invocation was attempted. The repository snapshot does not contain installed workspace dependencies or generated Prisma client artifacts, so a full compile cannot be certified in this environment.
- Prisma CLI validation was attempted but could not complete because dependency installation/network resolution was unavailable within the execution window.

## Required staging/CI gate before production

Run, in order:

1. `pnpm install --frozen-lockfile`
2. `pnpm --filter @uniportal/api prisma:generate`
3. `pnpm --filter @uniportal/api prisma:validate`
4. `pnpm --filter @uniportal/api prisma:migrate:deploy`
5. API type-check/build
6. unit tests for academic-domain engine
7. API integration tests with PostgreSQL/RLS enabled
8. browser E2E for student academic journey and registration
9. concurrency test for registration credit limits
10. result-publication/amendment and graduation-audit tests
11. backup/restore and production security gates

No runtime success is represented here where the required infrastructure was not available.
