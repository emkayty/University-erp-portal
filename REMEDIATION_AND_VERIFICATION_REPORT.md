# UniPortal ERP v43.14 — Remediation and Verification Report

**Date:** 16 August 2026  
**Working copy:** `/home/ubuntu/uniportal_repair`  
**Baseline:** Original submitted archive preserved separately; SHA-256 recorded in `BASELINE_SHA256.txt`.

## Executive status

The repair was performed in a reversible working copy. The highest-risk changes that could be safely implemented without a live university infrastructure environment were applied and verified. The codebase now passes type-checking, linting, Prisma validation, backend unit tests, frontend type-check/lint/build, production dependency audit, academic-integrity contract validation, operational-contract validation, integration-contract audit, static security audit, and consumer/provider Pact discovery.

A professional **100% production-readiness claim is not justified** yet. The remaining gaps are evidence gaps and certification blockers, not hidden failures: the API coverage threshold remains below the repository’s configured policy; the provider Pact suite is deliberately skipped unless `RUN_LIVE_CONTRACT_TESTS=true`; browser accessibility execution requires the Playwright Chromium binary; and PostgreSQL/RLS, Redis, object storage, workers, payment sandboxes, privacy deletion, backup/restore, and performance certification require real staging infrastructure.

## Applied changes

| Area | Applied change | Verification |
|---|---|---|
| Password reset | Added per-account Redis lock with cryptographically random ownership value, bcrypt verification inside the critical section, and ownership-safe Lua lock release. This prevents concurrent redemption of the same OTP. | API type-check, lint, auth tests, full API tests passed. |
| Mandatory MFA | Bound the setup secret to the server-side setup token; confirmation now rejects client-secret substitution. MFA enrollment uses a conditional `mfaEnabled=false` update and rejects duplicate enrollment. Mandatory setup completion consumes the setup token with Redis `GETDEL`. | API type-check, lint, auth tests, full API tests passed. |
| Frontend auth contract | Preserved the discriminated mandatory-MFA flow and ensured session routing state is set only after a real access token/user response. Added `Secure` to the non-authoritative routing cookie on HTTPS and consistent `SameSite=Strict` cleanup. | Web type-check, lint, Pact consumer, and production build passed. |
| Dependency security | Confirmed the effective workspace override for `js-yaml` is in `pnpm-workspace.yaml`; removed an ignored root `package.json` override. The lockfile resolves `js-yaml` 5.3.0 and the production audit reports zero advisories. | `pnpm install --frozen-lockfile`, API/web lint, and `pnpm audit --prod` passed with zero vulnerabilities. |
| Pact provider configuration | Added Jest module aliases matching the API TypeScript workspace paths. The provider suite now loads instead of failing on `@uniportal/config`. | Provider suite executes; it is skipped by design without live infrastructure. Consumer test passes. |
| Academic integrity | Added migration `0043_academic_score_invariants` with database checks for positive component maxima, weight range, non-negative assessment scores, non-negative result-version scores, and non-negative grade points. Existing data is protected with `NOT VALID` constraints until staging data validation is completed. | Prisma validation, assessment/results tests, P1 academic-integrity contract passed. |
| Static security audit | Excluded generated coverage output and refined the evaluator pattern so intentionally scoped Redis `.eval()` calls are not falsely classified as global JavaScript evaluation. Source checks still flag global `eval`, `new Function`, hardcoded recognizable secrets, and dangerous HTML injection. | Static P5 security audit passed. |

## Final verification evidence

| Gate | Result |
|---|---:|
| API type-check | Pass |
| Web type-check | Pass |
| API lint | Pass |
| Web lint | Pass |
| Prisma validation | Pass |
| API unit tests | Pass — 36 suites, 453 tests |
| Web normal tests | Pass with limitation — no ordinary tests are discovered because the existing command uses `--passWithNoTests` and excludes Pact/E2E |
| Web Pact consumer | Pass — 1 test |
| API Pact provider loading | Pass with limitation — suite executes but skips live test unless `RUN_LIVE_CONTRACT_TESTS=true` |
| Production web build | Pass — Next.js build completed and generated 39 routes |
| Production dependency audit | Pass — 0 info, 0 low, 0 moderate, 0 high, 0 critical vulnerabilities |
| P1 academic integrity validator | Pass — 11 invariants |
| P2 operational contract validator | Pass — 9 invariants |
| P5 integration contract audit | Pass |
| P5 static security audit | Pass |
| API coverage | Not compliant — 36 suites/453 tests pass, but configured thresholds fail at about 36.97% statements, 29.99% branches, 28.25% functions, and 37.58% lines; auth, LMS, and privacy module thresholds remain below policy |
| Playwright accessibility | Not executed — Playwright Chromium headless-shell is not installed in the environment |
| Live PostgreSQL/RLS/E2E | Not executed — no certification database and role topology supplied |
| Payment/storage/privacy/backup/restore | Not certified — requires provider and infrastructure sandboxes |

## Important deployment instructions

Before applying migration `0043_academic_score_invariants` to a production database, run a staging diagnostic for existing violations. Because the constraints are `NOT VALID`, new writes are protected while existing rows remain subject to a deliberate remediation decision. After cleaning invalid legacy rows, validate each constraint in a controlled migration or DBA-approved operation.

Run the full live provider Pact suite only in a certification environment with `RUN_LIVE_CONTRACT_TESTS=true`, a real test database, generated JWT keys, Redis, and all required environment variables. A skipped provider test must not be reported as a passing live contract test.

Do not promote to unrestricted production solely because local checks are green. The release gate still requires RLS matrix tests, object-storage completion and size tests, payment replay/reconciliation tests, privacy erasure tests, worker dead-letter/replay tests, backup/restore rehearsal, performance tests, and browser accessibility tests.

## Source and manifest integrity

The repaired source tree and verification logs are included in the delivery archive. `release_source_sha256.txt` contains hashes for the source tree excluding installed dependencies and generated Next output. `release_manifest_sha256.txt` contains hashes for the package manifests and lockfile. The original archive is not overwritten.

## Authoritative implementation references

The authentication changes follow [OWASP Forgot Password guidance](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), which requires reset identifiers to be cryptographically generated, securely stored, single-use, and expiring. The session handling follows [OWASP Session Management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). The Redis lock release follows [Redis Lua scripting guidance](https://redis.io/docs/latest/develop/programmability/eval-intro/), including atomic server-side execution and explicit `KEYS`/`ARGV` parameterization.

The academic migration is an engineering safeguard, not a claim of regulatory compliance. Nigerian institutional policy, NUC/JAMB procedures, NDPA/NDPC obligations, retention schedules, and Senate-approved result rules still require explicit institutional sign-off and live certification.


## Continuation workstream results

The follow-on work added explicit outbox retry scheduling and dead-letter observability. Migration `0044_outbox_retry_dead_letter` adds nullable `deadLetteredAt` and `nextAttemptAt` fields plus a retry-queue index. The worker now excludes processed, dead-lettered, and not-yet-due events; failed events receive bounded exponential retry scheduling; and the final failed attempt is marked dead-lettered and logged. New tests cover scheduled retry behavior and terminal dead-letter handling.

The follow-on regression suite added password-reset tests for valid redemption, account-lock contention, and missing OTP behavior. The API suite now reports **37 test suites and 457 tests passing**. The storage and privacy suites already present in the repaired copy were retained and included in the full run.

A reproducible `docker-compose.certification.yml` was added for PostgreSQL, Redis, MinIO-compatible private storage, and Mailpit. `scripts/verify/start-certification-stack.sh` fails closed without Docker or required cryptographic/seed secrets, exports staging-safe connection defaults, captures service state, and explicitly avoids generating credentials. The script was syntax-checked and intentionally attempted in this environment; execution was blocked because Docker is unavailable.

### Continuation verification matrix

| Gate | Result |
|---|---:|
| API full tests | Pass — 37 suites, 457 tests |
| API type-check | Pass |
| Web type-check | Pass |
| API lint | Pass |
| Web lint | Pass |
| Prisma validation | Pass |
| Web production build | Pass |
| P1 academic integrity validator | Pass — 11 invariants |
| P2 operational validator | Pass — 9 invariants |
| P4 rule verification | Pass |
| P5 static security audit | Pass |
| P5 integration-contract audit | Pass |
| Web Pact consumer | Pass |
| Production dependency audit | Pass — zero reported vulnerabilities |
| API coverage policy | Still not compliant — 37.26% statements, 30.06% branches, 28.49% functions, 37.86% lines overall; configured auth, LMS, and privacy module thresholds remain unmet |
| Live certification stack | Not executed — Docker unavailable in the sandbox |

The remaining coverage failure is reported honestly rather than bypassed. The next engineering step for a true coverage gate is targeted testing of the uncovered authentication lifecycle, LMS authorization/content paths, privacy pseudonymization relations, and live database/RLS branches. The next operational step is execution of the supplied certification stack on a Docker-capable staging host with institution-approved secrets and provider sandboxes.
