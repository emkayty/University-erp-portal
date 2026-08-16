# Production Certification Gates

`pnpm verify:production` is the authoritative fail-closed command. It requires explicit secure seed credentials, a migration-owner database URL, a restricted runtime database URL, and real integration services. It cannot pass if any build, test, security, deployment, schema, seed, or end-to-end gate fails.

## Current automated evidence

| Gate | Current result | Release interpretation |
| --- | --- | --- |
| Dependency installation, Prisma generation, API and web type checks | Passed in the reconciled sandbox | Source/tooling baseline is reproducible. |
| Unit and contract tests | Passed: 24 suites, 367 tests | Unit behavior is covered at the existing suite depth. |
| Dynamic-code tripwire | Passed | The grep gate is a supplemental tripwire, not a substitute for secure code review. |
| Deployment topology validation and production build | Passed | Deployment manifests are internally consistent and builds complete. |
| API E2E gate | Implemented with `apps/api/test/e2e/auth-security.e2e-spec.ts`; `passWithNoTests=false` | Must execute successfully against the real API/database/Redis environment. |
| Live PostgreSQL/RLS and API/worker rehearsal | Implemented fail-closed integration suite and runtime evidence gate | Must execute against the restricted production-equivalent role and services. |

## Required runtime evidence

The following gates must pass against an isolated real PostgreSQL instance with RLS enabled, never a mocked Prisma client. The repository now contains the corresponding automation/gates; the remaining work is execution in staging/production-equivalent infrastructure and attaching the resulting evidence.

| Domain | Minimum certification cases |
| --- | --- |
| RLS and authorization | Institution/department isolation, self-only student records, assigned-course lecturer access, revoked-session rejection, and concurrent request identity isolation. |
| Academic integrity | Registration limits/prerequisites/repeats; result calculation/moderation/publication/locking; CGPA, transcript, degree-audit, and graduation edge cases. |
| Finance | Duplicate, delayed, reordered, timed-out, reversed, partial, overpayment, concurrent, and failed-transaction payment scenarios with financial-state invariants. |
| Browser workflows | Applicant, admission, student registration, lecturer results, examination publication, finance, clearance, graduation, administration, and MFA/session journeys. |
| Performance | Registration, result-publication, and payment spikes using institution-approved load targets. |
| Recovery | Backup, destructive restore, integrity validation, reconnect, RPO/RTO measurement, and queue consistency. |

No release may be described as production-certified until these evidence records are attached to the release decision.
