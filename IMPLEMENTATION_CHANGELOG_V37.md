# UniPortal ERP — Implementation Changelog V37

**Date:** 15 August 2026  
**Release:** V37 enhanced deep-audit remediation  
**Project:** UniPortal ERP monorepo (`NestJS API` + `Next.js frontend`)

## Release summary

V37 completes the implementation pass arising from the comprehensive architecture audit. The release repairs cross-layer response contracts, authorization boundaries, transaction semantics, privacy-rights workflows, report completeness, token rotation, deployment configuration, and frontend redirect behavior. The final source tree compiles, builds, lints, passes the complete available automated test suite, and passes the repository’s P1/P2/P4/P5 and route-contract validation checks.

The remediation was applied to the working project at `/home/ubuntu/deep_audit`. Generated dependencies, Next.js build output, TypeScript distribution output, Turbo state, and generated Prisma artifacts are excluded from the distributable archive.

## Implemented remediation

| Area | V37 implementation | Result |
|---|---|---|
| API response contract | Added and globally registered `ResponseEnvelopeInterceptor`. Raw JSON controller results now return `{ success: true, data }`; existing envelopes, 204 responses, binary payloads, and already-sent responses are preserved. | Frontend/API response shape is consistent without double-wrapping downloads or errors. |
| Student fee identity | Updated invoice lookup authorization to use `resolveSelfOrTargetStudentId()` rather than comparing a fee’s student identifier directly with the JWT subject. | Student self-service and privileged target access use the same identity policy. |
| Report authorization | Added `authorizeReportRequest()` with role-based report-type policy and HOD department scoping. Report generation receives the complete JWT actor, and queue enqueue errors mark jobs failed and surface a service-unavailable response. | Report generation is explicitly authorized and operational failures are observable. |
| Fee-waiver concurrency | Moved waiver state reads, row locks, cap checks, state transitions, and fee updates inside transactions. Added HOD department ownership enforcement and segregation-of-duties checks. | Concurrent approval, rejection, and request races cannot approve stale state. |
| Invoice idempotency | Replaced sequential invoice numbering with a deterministic SHA-256-derived identifier from `feeScheduleId:studentId`. | Re-running invoice generation is deterministic and collision-resistant. |
| Refresh-token rotation | Replaced non-atomic GET/DEL behavior with a Redis Lua operation. V37 uses `EVALSHA` with a `NOSCRIPT` fallback to load the script after Redis restarts. | A refresh token can be consumed only once even under concurrent requests. |
| CSV exports | Hardened CSV escaping for formula-triggering prefixes (`=`, `+`, `-`, and `@`) by prefixing them with a neutralizing apostrophe. | Spreadsheet formula injection is mitigated in generated reports. |
| Login redirect | Added `safeInternalRedirect()` to accept only same-origin internal paths from the `from` query parameter. | Post-login open redirects are blocked. |
| Middleware auth flow | Reordered middleware checks so authenticated users are redirected away from authentication pages before the public-path early return. | Authenticated-session routing behaves consistently. |
| Production compose | Added Redis password wiring, required frontend origin and public API URL variables, Remita verification settings, reporting database configuration, and AWS credential variables. | Production configuration fails fast for missing required deployment inputs and aligns health checks with Redis authentication. |
| Environment schema | Added `optionalUrl` handling for provider, reporting, and replica URL fields, allowing empty optional values while rejecting malformed non-empty URLs. | Environment validation matches production compose semantics. |
| Privacy erasure | Made erasure, legal-hold pseudonymisation, historical audit-log scrubbing, and DSR evidence creation atomic. The flow now validates that the VC approval reference identifies a distinct active VC user through the `User.roles` relation. | Partial erasures and unverifiable approval references are prevented. |
| Privacy SAR and portability | DSR rows and report jobs are created transactionally before queue submission. Queue failures mark both records failed/rejected and return an explicit unavailable response. | Requests cannot disappear silently when the reporting queue is unavailable. |
| Privacy export completeness | Expanded custom portability/SAR data collection to clinic records, appointments, medical records with decryption, prescriptions, library loans, hostel allocations, alumni profiles and donations, and applicant profiles. Removed silent empty-array fallbacks. | Data-subject exports no longer silently omit major functional domains. |
| DSR DTO validation | Changed `vcApprovalReference` to UUID validation. | Invalid approval identifiers are rejected at the API boundary. |
| Results report scope | Added HOD department filtering to `RESULTS_STATISTICS`. | Department-scoped reporting is enforced consistently. |
| Regression coverage | Added response-envelope interceptor tests; updated privacy and fee-waiver fixtures/assertions for transactional behavior, VC roles, and department scope. | New security and contract behavior is covered by automated tests. |

## Source-level compile repair completed in V37

The final blocked compiler errors were in `privacy.service.ts`. The service previously called `$transaction` on the `forRequest()` union, whose transaction-client branch does not expose `$transaction`. Top-level SAR, portability, and erasure transactions now use `PrismaService.$transaction()`, while the request-scoped client remains in use for ordinary RLS-aware reads and writes. The VC lookup was also corrected from a non-existent scalar `role` field to the `roles.roleName` relation.

The privacy test double was updated to model PrismaService-level transactions, `findUniqueOrThrow`, and UserRole membership. Fee-waiver fixtures were updated to provide the required department scope and to assert transaction-client updates. These changes preserve the production concurrency design rather than weakening it to satisfy stale mocks.

## Verification evidence

| Check | Result |
|---|---:|
| Prisma client generation | Passed |
| Prisma schema validation | Passed |
| Monorepo type-check | Passed; 9 Turbo tasks successful |
| Production build | Passed; 5 Turbo tasks successful |
| Lint | Passed; 5 Turbo tasks successful |
| API test suites | **22 passed** |
| API tests | **353 passed** |
| Utility test suites | **5 passed** |
| Utility tests | **36 passed** |
| P1 academic-integrity validation | Passed; 11 invariants |
| P2 operational-contract validation | Passed; 9 invariants |
| P4 rules validation | Passed |
| P5 static security audit | Passed |
| P5 contract validation | Passed |
| P5 integration contract audit | Passed |
| API route-contract suite | Passed; 13 tests |

The final verification run is recorded in `verification/deep_verification_final.log`. The serial test output is recorded in `verification/full_tests_final.log`, and the repository-generated individual check logs remain under `verification/`.

## Environmental limitation

The optional hermetic Docker E2E certification could not be executed in this sandbox because Docker is unavailable. The repository’s `scripts/test/run-e2e-hermetic.sh` reports `Docker is required for hermetic E2E certification` before starting any test containers. This is an environment limitation, not a source compilation or unit/integration-test failure. All non-Docker checks listed above passed.

## Archive contents and exclusions

The distributable archive contains the complete enhanced source project, documentation, migrations, tests, verification logs, and changelog. It excludes `node_modules`, `.next`, `dist`, `.turbo`, and generated dependency artifacts to keep the archive portable and reproducible from the lockfile.

## References

[1]: COMPREHENSIVE_ARCHITECTURE_AUDIT.md "UniPortal ERP comprehensive architecture audit"
[2]: verification/deep_verification_final.log "V37 final deep-verification output"
[3]: verification/full_tests_final.log "V37 full serial test output"
