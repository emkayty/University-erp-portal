# UniPortal ERP — Critical End-to-End Project Evaluation

**Assessment date:** 15 August 2026  
**Assessment scope:** Full pnpm/Turbo monorepo, NestJS API, Next.js frontend, shared packages, Prisma schema and migrations, security controls, operational scripts, tests, release artifacts, and V42 LMS private attachment storage.  
**Assessment posture:** Independent review of the current filesystem state; prior release claims were re-tested rather than accepted without evidence.

## Executive conclusion

UniPortal ERP is a **broad and technically serious ERP foundation**, not an empty scaffold. It contains 29 backend domain modules, approximately 298 controller routes, 37 frontend pages, a substantial Prisma model, PostgreSQL RLS migrations, JWT/MFA authentication, queue-backed asynchronous work, private object-storage support, and meaningful domain-level tests. The core source compiles, lint passes, the production web build succeeds, the API and utility unit suites pass, and the repository’s static integrity/security contracts pass.

However, the project is **not presently defensible as production-certified**. The correct professional classification is **conditional release / no-go for unrestricted production deployment** until several material defects and evidence gaps are closed. The most important issue is a real frontend/backend authentication contract break for mandatory MFA setup. The backend can return `requiresMfaSetup`, but the frontend only understands ordinary success and `requiresMfa`; the affected user is then routed as if logged in without a valid access token or refresh session. This is primarily an availability and security-control failure for roles where MFA is mandatory.

The second major concern is verification credibility. Unit tests, lint, build, and static audits pass, but API coverage is far below the configured thresholds; integration and end-to-end suites could not execute without database and cryptographic environment variables; both Pact harnesses are misconfigured and discover zero tests; and the Playwright accessibility harness cannot start its web server with the configured command. Consequently, the project demonstrates **strong static and unit-level health but incomplete runtime and contract-level validation**.

| Assessment area | Result | Professional interpretation |
|---|---:|---|
| Architecture breadth | Strong | The monorepo has a credible multi-domain ERP architecture and explicit infrastructure boundaries. |
| Backend compilation and unit behavior | Pass | 28 API suites and 393 API tests passed in the current baseline. |
| Utility-package tests | Pass | 5 suites and 36 tests passed. |
| Frontend compilation and production build | Pass | Type-check, lint, and Next production build passed. |
| Cross-layer literal route alignment | Pass | The independent route matrix found no literal frontend path without a compatible controller route. |
| Security/static contracts | Pass | P1, P2, P4, P5 static, integration-contract, and route-contract checks passed. |
| Coverage compliance | Fail | API coverage is 34.14% statements / 34.35% lines / 25.01% functions / 27.37% branches against higher configured thresholds. |
| Runtime integration certification | Not demonstrated | Database-backed integration and E2E suites were blocked by missing runtime infrastructure. |
| Consumer/provider contracts | Fail | Pact commands discover zero tests due to incorrect Jest path configuration. |
| Browser accessibility verification | Fail | Playwright web-server startup fails because the configured Next start command is parsed as an invalid project directory. |
| Production dependency risk | Fail pending triage | `pnpm audit --prod` reported 1 critical, 27 high, 21 moderate, and 1 low advisory. |
| Release recommendation | Conditional no-go | Remediate the high-priority findings and run certification against real infrastructure before production approval. |

## Assessment method and evidence boundary

The review used source inspection, schema and migration analysis, route extraction, frontend/backend path comparison, fresh type-check/test/lint/build runs, direct coverage execution, dependency auditing, static security contracts, runtime-prerequisite checks, and inspection of the release packaging state. The assessment intentionally distinguishes **what passed locally** from **what was not executable without external infrastructure**.

> A green unit-test/build result is evidence of compilation and selected behavior. It is not evidence that PostgreSQL RLS, Redis token rotation, queue workers, S3-compatible storage, SMTP/SMS providers, payment gateways, browser flows, or production deployment topology work together correctly.

The current snapshot does not contain Git metadata. `git_metadata=missing` was confirmed at the repository root. This does not prove that the source is wrong, but it materially weakens change traceability, review provenance, bisectability, and reproducibility of future releases. The V42 archive checksum was independently observed as `63ae91a05b3e8be3f2f1488ecffdceaf9f1fde102cab496e38885256c5676846`, while the current source tree itself is not a Git working tree.

## Verified strengths

The project has a coherent NestJS composition root. `AppModule` registers authentication, throttling, feature flags, RLS context, response envelopes, database, Redis, BullMQ, health, reliability, intelligence, and the domain modules through explicit module imports and global providers. The bootstrap configures DTO whitelisting with `forbidNonWhitelisted`, CORS with credentials, Helmet, compression, raw-body capture for payment webhook verification, URI versioning, a global API prefix, and a standardized exception filter. These are meaningful production-oriented controls rather than cosmetic scaffolding.[1] [2]

The authentication design is materially stronger than a basic bearer-token implementation. Access tokens use RS256 with issuer and audience validation; refresh tokens are stored as hashes in Redis; rotation uses a Redis-side atomic consume operation; access tokens are held in frontend memory rather than local storage; and inactive users are checked through a Redis-cached database status path. The implementation still requires the remediation described below, but the underlying security direction is sound.[3] [4]

The project also has a defensible cross-layer contract pattern. The frontend API client centralizes the response envelope, request IDs, credentials, bearer headers, refresh retry, and binary download behavior. The independent route matrix extracted 298 controller routes and 33 literal frontend API paths and found no literal path lacking an exact or parameter-compatible backend route. This does not prove payload compatibility for every endpoint, but it is useful evidence that the route surface is broadly wired rather than disconnected.[5]

The V42 LMS storage work is conceptually sound in its authorization model. Presigning is gated by assignment existence and active enrolment; keys are scoped beneath `lms/submissions/{studentId}/{contentId}/`; downloads are authorized for the owner or staff; and the frontend uploads directly to private storage rather than placing file bytes in the database. The storage and LMS tests passed, and the health integrations response exposes a secret-safe readiness signal.[6] [7]

## Severity-ranked findings

### F-01 — High: mandatory MFA setup is not implemented end to end

The backend login service has a reachable branch that returns `type: 'mfa_setup_required'`, a setup token, and an expiry when an institution marks a user’s role as MFA-mandatory and the user is not enrolled. The controller serializes this as `requiresMfaSetup: true` and exposes public setup and confirmation routes. The frontend login form and Zustand store, however, only recognize `requiresMfa`; every other result is cast as ordinary success. The login form sets `session_active` and redirects, while the store attempts to read `accessToken` and `user` from a response that does not contain them.[8] [9] [10]

This is a genuine contract defect, not merely a missing screen. A privileged user subject to mandatory MFA can be placed into a false client-authenticated state without a valid session, then encounter an opaque session-expired loop or an unusable dashboard. It also means the mandatory MFA policy cannot be operationally deployed with confidence. The remedy is to define a discriminated shared `LoginResult` union, add the mandatory setup flow to the store and login UI, test the complete setup-confirm-login sequence, and avoid setting the session indicator until a real access token and user profile are present.

### F-02 — High: production dependency audit is not clean

A fresh `pnpm audit --prod --json` reported 49 advisories: 1 critical, 27 high, 21 moderate, and 1 low. The affected production paths include Next.js, Nodemailer, Multer through Nest’s Express adapter, Sharp through Next, and `tar` through bcrypt’s native-install chain. The exact exploitability differs by code path and deployment mode, so the count should not be treated as 49 equally exploitable vulnerabilities; nevertheless, a production release gate cannot treat this as a clean dependency state.[11] [12]

The immediate action is a package-by-package triage with lockfile updates, direct upgrades where available, and written applicability decisions for advisories that remain because they are installation-only, unreachable, or fixed only in a future major version. The result should be a CI policy that fails on unapproved critical/high production advisories rather than relying on a manual audit command.

### F-03 — High: runtime certification is incomplete and infrastructure-gated

The current sandbox has no `DATABASE_URL`, `DATABASE_DIRECT_URL`, `MIGRATE_DATABASE_URL`, Redis configuration, JWT keys, encryption key, S3 upload bucket, or frontend origin. The production certification script correctly fails closed at the first missing required variable. The database/RLS integration suite fails because `DATABASE_URL` is absent, while the API E2E suite fails during environment validation because database and JWT variables are absent.

This is not evidence that the runtime is broken; it is evidence that runtime correctness remains unproven. Before production approval, the project needs a repeatable certification environment containing PostgreSQL with the intended restricted and system roles, Redis, generated RS256 keys, encryption material, worker processes, and representative S3-compatible storage. The certification output should be retained as a release artifact.

### F-04 — High: configured coverage gate is materially violated

The API coverage command completed all 28 suites and 393 tests successfully, but Jest then failed its configured thresholds. Aggregate coverage was 34.14% statements, 27.37% branches, 25.01% functions, and 34.35% lines against thresholds of 80%, 70%, 80%, and 80%. Utility-package coverage was also modest at approximately 49.73% statements and 55.46% lines. Module-level coverage is especially low in several sensitive domains, including LMS, auth, students, results, reports, HR, policies, settings, and users.[13]

The normal `test` command does not run coverage, so the repository can report a green test task while its explicit coverage policy fails. The team should either raise coverage through controller, guard, authorization, failure-path, and integration tests or deliberately revise the thresholds with a documented risk decision. Leaving the thresholds aspirational but unenforced in routine CI is misleading.

### F-05 — High: both Pact verification commands are broken by test-root configuration

The API provider command and web consumer command both fail with “No tests found.” Each config is located inside `test/pact` but uses `testMatch: ['<rootDir>/test/pact/**/*.pact.spec.ts']`. Because Jest defaults `rootDir` to the config directory in these invocations, the effective path becomes `test/pact/test/pact/...`, while the actual specifications are directly under `test/pact/`. The provider and consumer spec files therefore exist but are not discovered.[14] [15]

This invalidates the project’s current consumer/provider contract-verification claim. The fix is small but important: set an explicit repository-relative `rootDir` or use a correct relative `testMatch`, then run the consumer and provider suites against a live API and generated pact artifact in CI.

### F-06 — High: Playwright accessibility verification cannot start its configured web server

The frontend accessibility suite contains useful checks for login, forgot-password, application, and keyboard usability, but the command fails before tests execute. The configured web-server command is `pnpm run start -- -p 3000`; in the current environment, Next interprets `-p` as an invalid project directory and exits. The failure is therefore in the test harness or command syntax, not in the accessibility assertions.[16] [17]

The web-server command should be made unambiguous, preferably by invoking the built Next server with the supported port syntax or by using an explicit shell command tested on the target CI image. The suite should then run against a real built application and be included in the release gate.

### F-07 — High: Prisma’s required environment contract disagrees with the application environment schema

`schema.prisma` requires both `DATABASE_URL` and `MIGRATE_DATABASE_URL` for Prisma CLI validation, while `packages/config/src/env.schema.ts` declares `MIGRATE_DATABASE_URL` optional. In a clean environment, `prisma validate` failed first for missing `MIGRATE_DATABASE_URL`, and after supplying it failed for missing `DATABASE_URL`; supplying both allowed validation and generation to pass. The application environment validator therefore does not describe the complete environment required by the repository’s database tooling.[18] [19]

This creates avoidable deployment and CI ambiguity. The project should decide whether the migration URL is truly mandatory, make the schema and validator consistent, and provide a documented non-production strategy for local validation. The same review should identify unused or misleading configuration such as `API_PREFIX`, which is declared but not consumed by runtime bootstrap code; the API prefix is hard-coded instead.[20]

### F-08 — High: V42 storage size enforcement is not enforced at object-storage level

The LMS presign API validates the requested attachment size up to 10 MiB, but the SigV4 PUT URL signs only the `host` header. The returned `Content-Type` is not part of the signed headers, and the requested size is not constrained by a signed content-length or a POST policy. A client that obtains a valid URL can therefore attempt a body larger than the metadata size supplied to the API, subject to bucket and network limits. The API-level check is useful input validation but is not a storage-level size guarantee.[21]

The robust fix is a presigned POST policy with a `content-length-range` condition, a trusted upload proxy that enforces bytes, or a storage/bucket policy with a documented enforcement mechanism. The object key should also be reconciled after upload, ideally by a completion/head verification step that validates size and content type before the submission becomes authoritative.

### F-09 — Medium/High: storage implementation is duplicated and not actually provider-neutral

V42 introduces `PrivateObjectStorageService`, but the reports subsystem still contains its own SigV4 implementation and separate ECS/IMDS credential resolution. Both implementations hard-code AWS virtual-hosted endpoints of the form `{bucket}.s3.{region}.amazonaws.com`; neither accepts an explicit S3-compatible endpoint. This conflicts with the project’s stated S3-compatible storage posture and creates two independently evolving credential, signing, timeout, and error-handling paths.[22] [23]

The project should centralize credential resolution and signing behind one tested adapter with endpoint, path-style/virtual-hosted-style, region, encryption, and timeout configuration. Metadata-service fetches should use bounded abort timeouts. Reports and LMS should then share the same behavior and security fixes.

### F-10 — Medium/High: privacy erasure has a high-risk relational and completeness boundary

The erasure service hard-deletes a user when no academic legal hold exists, but `DataSubjectRequest.subjectUserId` and `requestedById` are required relations without explicit cascade behavior in the Prisma schema. Existing DSR records may therefore prevent hard deletion unless the live database constraints differ from the schema expectation. The service also pseudonymizes old and new audit payloads for rows where the subject was the actor, but it does not generally clear historical `targetId` or metadata references to the subject. The outcome should be validated against a real migrated database with a user who has prior login, DSR, audit, student, and module records.[24] [25]

This is a release-blocking data-governance risk until an integration test proves both branches: hard deletion of an eligible user with prior activity, and pseudonymization under academic legal hold. The test must verify foreign keys, audit searchability, DSR traceability, and absence of recoverable PII across all related tables.

### F-11 — Medium: frontend automated test coverage is effectively absent in the normal test command

`apps/web` has only two named test areas: a Pact consumer specification and a Playwright accessibility specification. The ordinary web `test` script explicitly ignores `test/(pact|e2e)` and exits successfully with “No tests found.” Thus the standard monorepo test task provides no ordinary frontend behavioral assertions, while the two excluded suites currently fail independently as described above.[26] [27]

At minimum, authentication state transitions, API-client refresh behavior, route guards, critical dashboard data states, payments, LMS submission/upload, and role-sensitive rendering require browser or component tests. The current build proves that pages compile, not that the central workflows behave correctly in a browser.

### F-12 — Medium: release provenance is weak in the current source snapshot

The repository contains a lockfile, schema, migrations, verification logs, changelogs, and a checksum-verified V42 archive, but no `.git` metadata. This makes it impossible to independently verify the exact commit lineage, review history, or delta from V41 from the current project directory. It also makes future hotfix traceability dependent on external archive handling rather than the repository itself.

A production project should be restored to a version-controlled working tree or accompanied by an immutable source manifest containing commit identity, file hashes, dependency lock hash, migration list, and build environment metadata.

## Verification record

The following checks were executed during this assessment:

| Check | Result | Evidence interpretation |
|---|---:|---|
| Frozen/offline workspace installation | Pass | Lockfile resolved and workspace installation completed. |
| Prisma validation with both URLs supplied | Pass | Schema is syntactically valid; Prisma 6.19.3 emitted only a Prisma-7 configuration deprecation warning. |
| Prisma validation in clean environment | Fail | Missing `MIGRATE_DATABASE_URL`, then `DATABASE_URL`; environment contract is incomplete. |
| Monorepo type-check with explicit placeholder URLs | Pass | All workspace type-check tasks passed. |
| Serial unit tests | Pass | 28 API suites / 393 tests and 5 utility suites / 36 tests passed. |
| Lint | Pass | API, web, config, types, and utilities passed with configured zero-warning policy where applied. |
| Production build | Pass | API and web build tasks passed. |
| P1/P2/P4/P5 static contracts | Pass | All independently rerun static contracts passed. |
| Route-contract suite | Pass | 13 route/payment boundary tests passed. |
| Independent route matrix | Pass | No literal frontend path lacked a compatible controller route. |
| API coverage | Fail | 393 tests passed but configured coverage thresholds failed. |
| Database/RLS integration suite | Not executed | Fails closed because `DATABASE_URL` is absent. |
| API E2E suite | Not executed | Fails during environment validation because database and JWT settings are absent. |
| API Pact provider suite | Fail | No tests discovered due incorrect Jest root/glob configuration. |
| Web Pact consumer suite | Fail | No tests discovered due the same configuration pattern. |
| Web accessibility suite | Fail | Playwright web-server command exits before tests begin. |
| Production certification script | Not certified | Fails closed on missing `DATABASE_URL`, as designed. |
| Production dependency audit | Fail pending triage | 49 production advisories reported across critical/high/moderate/low severities. |

## Release decision

The project should **not receive an unrestricted production approval** from this assessment. It is appropriate for continued engineering, controlled staging, and targeted remediation. A production release can become supportable after the following minimum closure conditions are met:

| Priority | Closure condition |
|---|---|
| P0 | Repair the mandatory-MFA setup contract and verify the entire setup-confirm-login path for a role whose MFA is mandatory. |
| P0 | Execute PostgreSQL/RLS, Redis, worker, authentication, privacy-erasure, queue, and storage integration tests against the intended deployment topology. |
| P1 | Repair both Pact configurations and the Playwright server command, then make consumer/provider/browser checks mandatory CI gates. |
| P1 | Resolve or formally accept all production critical/high dependency advisories with a written applicability record. |
| P1 | Either meet the configured coverage thresholds or revise them through an explicit risk decision and add high-value controller/authorization/frontend tests. |
| P1 | Align `MIGRATE_DATABASE_URL`, `DATABASE_URL`, `API_PREFIX`, and related environment documentation with actual runtime and migration behavior. |
| P1 | Enforce object size/content-type at storage level and consolidate LMS/report storage signing behind a provider-configurable adapter. |
| P1 | Prove privacy erasure and legal-hold behavior on a real migrated database, including foreign-key behavior and historical PII reference cleanup. |
| P2 | Restore Git provenance or provide an immutable source manifest and reproducible release metadata. |

## Final professional assessment

UniPortal ERP has a credible architecture and demonstrates real engineering effort. The backend and frontend are broadly connected, the principal domains are represented, the most important infrastructure patterns are present, and the current release passes a meaningful static/unit/build baseline. It would be inaccurate to describe the system as fundamentally broken or unwired.

It would be equally inaccurate to describe it as fully verified, uniformly mature, or production-certified. The project currently has **strong breadth, acceptable compile-time integrity, and useful unit-level assurance, but insufficient runtime evidence and several material cross-layer and release-process defects**. The appropriate next step is not another broad feature wave; it is a focused certification and hardening wave that closes the findings above, especially mandatory MFA, runtime integration, contract-test discovery, dependency exposure, coverage credibility, storage enforcement, and privacy erasure behavior.

## References

[1]: ./apps/api/src/main.ts "NestJS API bootstrap and global security/runtime configuration"
[2]: ./apps/api/src/app.module.ts "NestJS composition root and global providers"
[3]: ./apps/api/src/modules/auth/services/token.service.ts "RS256 token issuance and atomic refresh rotation"
[4]: ./apps/api/src/modules/auth/strategies/jwt.strategy.ts "JWT validation and account-status enforcement"
[5]: ./verification/evaluation/erp_route_matrix.txt "Independent frontend/controller route matrix output"
[6]: ./apps/api/src/common/storage/private-object-storage.service.ts "Private S3-compatible object-storage signing implementation"
[7]: ./apps/api/src/modules/lms/lms.service.ts "LMS enrolment, attachment presign, and download authorization"
[8]: ./apps/api/src/modules/auth/auth.service.ts "Backend mandatory-MFA login branch"
[9]: ./apps/api/src/modules/auth/auth.controller.ts "Mandatory-MFA setup and confirmation routes"
[10]: ./apps/web/app/auth/login/login-form.tsx "Frontend login and MFA state machine"
[11]: ./verification/evaluation/erp_dependency_audit_summary.txt "Production dependency audit summary"
[12]: ./apps/api/package.json "Production dependency declarations and runtime packages"
[13]: ./verification/evaluation/erp_api_coverage.log "API coverage execution and threshold result"
[14]: ./apps/api/test/pact/jest-pact.config.ts "API Pact Jest configuration"
[15]: ./apps/web/test/pact/jest-pact-consumer.config.ts "Web Pact Jest configuration"
[16]: ./apps/web/playwright.config.ts "Playwright web-server configuration"
[17]: ./apps/web/test/e2e/a11y.spec.ts "Frontend accessibility and keyboard tests"
[18]: ./apps/api/prisma/schema.prisma "Prisma datasource and direct migration URL contract"
[19]: ./packages/config/src/env.schema.ts "Application environment validation schema"
[20]: ./apps/api/src/main.ts "Hard-coded API global prefix"
[21]: ./apps/api/src/common/storage/private-object-storage.service.ts "Presigned PUT request and size validation implementation"
[22]: ./apps/api/src/modules/reports/services/report-artifact.service.ts "Parallel report storage signer and credential resolver"
[23]: ./packages/config/src/env.schema.ts "Available storage configuration variables"
[24]: ./apps/api/src/modules/privacy/privacy.service.ts "Privacy erasure and pseudonymization transaction"
[25]: ./apps/api/prisma/schema.prisma "User, DSR, audit, and academic relations"
[26]: ./apps/web/package.json "Frontend test scripts and excluded test paths"
[27]: ./apps/api/package.json "Backend unit, integration, E2E, Pact, and coverage scripts"
