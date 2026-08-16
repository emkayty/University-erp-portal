# UniPortal ERP v24 — Academic Lifecycle Forensic Audit

**Audited archive:** `uniportal-erp-v24-academic-lifecycle-complete-2026-08-14.zip`  
**Archive SHA-256:** `88716839cab95ac40cb3907f49d55977081911d63e6d919fe256681017d4e18f`  
**Scope:** source, schema, migrations, security boundaries, academic lifecycle, admissions, payments, testability, deployment artefacts, and packaging hygiene.  
**Method:** direct source tracing, Prisma validation/generation, type checking, unit/E2E gate execution, and static hygiene scans. No application code from the archive was executed outside its declared build/test commands.

## Post-remediation update — 14 August 2026

The original archive was remediated in the integrated source release at `uniportal-continue/uniportal`. The P0 compile blocker is resolved, and the high-risk academic, placement, plan-concurrency, payment-initiation, TSA receipt, role-alignment, and lifecycle-workflow defects listed below have source-level fixes and automated regression coverage. The release now passes full monorepo type checking, Prisma schema validation, 341 API unit tests, shared utility tests, deployment-artifact validation, dynamic-code checks, and production builds.

| Finding | Post-remediation disposition | Evidence in integrated release |
| --- | --- | --- |
| **P0-01** API compile blocker | **Resolved** | Explicit academic Prisma delegates; nullable requirement mapping repaired; API and monorepo type checks pass. |
| **P1-01** exceptions ignored by degree audit | **Resolved** | Approved exemptions, substitutions, transfer credits, and effective equivalencies are loaded inside the audit transaction and recorded in the immutable audit snapshot. |
| **P1-02** hard-coded progression/standing rules | **Resolved** | New scoped `AcademicPolicyVersion` model, validated rule definitions, precedence resolution, and prior-standing history mapping. Configuration remains mandatory and fails closed when no active applicable rule exists. |
| **P1-03** progression not operationally applied | **Resolved** | Recommended placement is distinct from application; Registrar/Super Admin application atomically changes student status/level, and registration consults applied placements. |
| **P1-04/P1-05** plan race and inconsistent outstanding courses | **Resolved** | Advisory lock plus transactional audit/plan replacement, a partial unique active-plan index, and canonical engine unmet-requirement output for journey and plan data. |
| **P1-06** lifecycle tables schema-only | **Substantially resolved** | Validated and audited request/decision workflows added for appeals, transfers, interruptions, credentials, and placements. Operations that affect student programme/status are transactional. |
| **P1-07/P1-08** duplicate provider/TSA instruments | **Resolved at source level** | Durable `INITIATING` payment lease before provider I/O, deterministic provider request IDs, and global immutable TSA receipt claims outside the partitioned payments table. |
| **P2-01/P2-02** staff/RLS mismatch and no academic tests | **Resolved at source level** | Generic `STAFF` removed from sensitive academic routes; `AcademicService` regression suite added. |
| **P2-03/P2-04** live E2E evidence absent | **Partially resolved** | Disposable PostgreSQL/Redis E2E compose stack and fail-closed runner added. It could not be executed in this sandbox because Docker is unavailable; a live DB/RLS/provider/recovery rehearsal remains a release gate. |

> **Current release decision:** The integrated source is suitable for controlled staging deployment after applying migration `0027_academic_lifecycle_integrity_hardening`. Production certification remains conditional on running the new hermetic E2E stack, real database/RLS matrix, provider sandbox tests, performance testing, and restore rehearsal in an environment with Docker or equivalent managed services.

## Executive conclusion

The archive contains substantial domain logic and several genuine reliability controls, including advisory locks for certain registration/result/payment operations, signed Paystack webhooks, durable outbox writes, RLS policy infrastructure, and a disciplined provider-verification model. However, the newly added academic-lifecycle layer is **not release-ready**. It introduces a blocking compile defect and persists academic decisions using incomplete, hard-coded policy inputs. Several lifecycle tables are schema-only with no executable workflow, and key workflows lack the transactional and uniqueness guarantees needed for authoritative academic records.

| Severity | Confirmed findings | Go-live implication |
| --- | ---: | --- |
| **P0 — release blocker** | 1 | API cannot pass type checking or build with the current academic lifecycle integration. |
| **P1 — high-risk correctness/security** | 7 | Can generate inaccurate degree/progression conclusions, duplicate plans/evaluations, or inconsistent finance side effects. |
| **P2 — material operational gaps** | 7 | Breaks expected workflows, weakens supportability, or leaves certification evidence absent. |
| **P3 — hygiene/design debt** | 5 | Increases maintenance, migration, or audit risk without immediate data compromise. |

## P0 — release blocker

| ID | Confirmed defect | Evidence | Required remediation |
| --- | --- | --- | --- |
| P0-01 | **The API does not compile after academic-lifecycle addition.** `AcademicService` accesses `this.prisma.academicRequirementGroup`, but `PrismaService` exposes no such delegate. Its fallback mapping also uses `programmeCourses.map(pc => pc.id)`, while the generated type has no `id` field. | `apps/api/src/modules/academic/academic.service.ts:62–63`; `pnpm type-check` produced four compiler errors, all in this service. Prisma schema validation and client generation succeeded, so this is an application integration error rather than a Prisma tooling issue. | Add correctly typed `PrismaService` forwarding delegates, correct the required model/relation names, and use the actual programme-course primary key or a stable requirement identifier. Add an AcademicService unit suite and a full API type-check gate before merging. |

## P1 — high-risk business, data-integrity, and authorization findings

| ID | Confirmed defect or loophole | Evidence | Risk | Required remediation |
| --- | --- | --- | --- | --- |
| P1-01 | **Degree audits ignore approved academic exceptions and policy data.** The service passes empty arrays for `exemptions`, `substitutions`, `transfers`, and `equivalencies`, even though the engine explicitly supports them. | `academic.service.ts:65` passes `exemptions: [], substitutions: [], transfers: [], equivalencies: []`. | Students with approved transfer credits, waivers, substitutions, or equivalencies can receive false `NOT_ELIGIBLE` conclusions; the stored audit snapshot then becomes misleading official evidence. | Load only approved, effective records inside the audit transaction; map them to engine input; persist referenced IDs and policy versions in the audit snapshot; regression-test each exception type. |
| P1-02 | **Progression and academic standing bypass the implemented policy framework.** The service hard-codes thresholds and sends an empty previous-standing history. | `academic.service.ts:78–79` hard-codes credit/CGPA/carryover/probation values and calls `evaluateAcademicStanding(period, [], ...)`; `academic-domain-engine.ts:201–275` contains a policy precedence resolver that is not used. | Programme, department, faculty, and institution rules cannot be applied consistently. A student repeatedly on probation will never reach the documented consecutive-probation suspension recommendation because history is always empty. | Resolve active scoped policy versions using student programme/department/faculty context; validate rule definitions; query ordered prior standing records; store selected version IDs and rule snapshots. |
| P1-03 | **Progression is only recorded, not applied.** The lifecycle service creates `ProgressionEvaluation` and `AcademicStanding` rows but does not create an academic placement, change level/status, suspend, or prevent later registration according to the decision. | `academic.service.ts:80–84`; schema includes `AcademicPlacement`, but the service does not use it. | The system can display an official-looking `NOT_ELIGIBLE` / `SUSPENSION_RECOMMENDED` result while leaving the student operationally eligible at the old level. This is a material academic-regulation inconsistency. | Design an explicit approval state machine: evaluate → recommend → independently approve → apply placement/status → audit/outbox. Tie registration eligibility to the applied decision, not merely a report row. |
| P1-04 | **Academic-plan generation is non-atomic and race-prone.** It reads active plans, supersedes them in one transaction, then creates a new active plan outside that transaction. The schema only indexes `[studentId,status]`; it does not enforce one active plan. | `academic.service.ts:92–104`; `schema.prisma:3816–3829`. | Concurrent degree-audit requests can leave multiple active plans or an audit with no plan after a mid-flow failure. Students and staff may receive conflicting advice. | Lock by student/curriculum key; create audit, supersede existing plan(s), and create exactly one new plan in one transaction; add a PostgreSQL partial unique index for one `ACTIVE` plan per student; test concurrent invocations. |
| P1-05 | **Degree-audit and plan data disagree about outstanding courses.** `computeOutstanding()` reports only failed results, whereas the plan treats every curriculum course not passed as remaining. | `academic.service.ts:97–103` versus `:107–111`. | A student with unattempted compulsory courses may see `outstandingCourses: 0` in the journey while the plan contains many required courses. This misstates graduation readiness. | Use one canonical requirement/allocation result for journey summary, plan creation, and degree audit. Do not derive outstanding requirements from failed results alone. |
| P1-06 | **Lifecycle tables are largely schema-only features.** Migration 0026 adds academic placements, plans, appeals, transfer requests, interruptions, credentials, and related entities, but source search found only `AcademicService` plus the schema for most of these models. | `0026_academic_lifecycle_completion/migration.sql`; repository search for lifecycle model names. | The database suggests complete workflows that no controller/service/authorization/state-transition logic actually implements. This is misleading product scope and produces orphaned, ungoverned data structures. | Either implement complete request/review/decision/reversal workflows with DTO validation, RLS and audits, or remove/defer unimplemented tables from the release. |
| P1-07 | **Payment initiation can create duplicate external payment instruments for one idempotency key.** The advisory lock is released after the initial existence check, before calling Paystack/Remita; a concurrent request can also call the provider before the second lock determines an existing local row. | `payments.service.ts:168–171`, outbound calls `:177–199`, second lock/persist `:210–225`. | Local ledger remains single-row, but two checkout sessions/RRRs can be issued and later confuse payers, reconciliation, and support. | Create a durable `INITIATING` row inside one lock before provider I/O, commit it, then call the provider; update its provider reference atomically; make retries resume the same record. Add concurrent idempotency integration tests. |
| P1-08 | **Manual TSA payments have no demonstrated idempotency guard for the external receipt.** A Bursar can create multiple `TSA_<reference>` pending payments; confirmation searches `findFirst({ providerRef })`. | `payments.service.ts:504–534`, `:369–396`; payment partitioning removes standalone provider-reference uniqueness. | A repeated manual submission may credit the wrong duplicate row or create duplicate operational evidence for one receipt. | Require a unique, partition-aware receipt strategy or a separate immutable receipt table with a unique reference; serialize by receipt reference and reject duplicates before creating a payment. |

## P2 — material operational and certification gaps

| ID | Finding | Evidence | Remediation |
| --- | --- | --- | --- |
| P2-01 | Academic lifecycle endpoints authorise generic `STAFF` for another student’s journey, audit, and progression actions, while RLS policies narrowly permit lecturer-owned draft/rejected results and department-scoped HOD/DEAN access. This is an inconsistent contract: staff calls may fail under RLS or imply rights that should not exist. | `academic.controller.ts:19–40`; RLS policies in `0016_integrity_rls_academic_hardening/migration.sql`. | Remove generic `STAFF` from sensitive lifecycle endpoints or add explicit staff-scope/assigned-course checks. Align controller roles, service checks, and RLS policies; test positive and negative cases. |
| P2-02 | New academic-lifecycle service has no dedicated test file. | Source search found `academic.service.ts`, but no AcademicService spec; only `packages/utils/src/academic-domain-engine.spec.ts`. | Add service and database integration tests for audit exceptions, scoped policies, probation streaks, plan concurrency, authorization, and irreversible approvals. |
| P2-03 | API E2E does not run in the audit environment without required secrets/database configuration. | `pnpm --filter @uniportal/api test:e2e` exits on missing `DATABASE_URL`, JWT keys, and encryption key. | Provide a hermetic test environment with generated test JWT keys, ephemeral PostgreSQL+pgvector, Redis, schema bootstrap, and non-production seed. Keep E2E fail-closed. |
| P2-04 | There is no evidence in this run of a live PostgreSQL boot, RLS matrix, concurrent identity-isolation, payment-failure, load, or restore test. | No running local service/database clients were available; tests executed were static/unit only. | Add and require real database integration suites and a documented recovery rehearsal before production certification. |
| P2-05 | Public admissions surface exposes broad reference and programme/cycle data. This is reasonable by itself, but no evidence was found here of abuse monitoring, CAPTCHA/bot mitigation, or proof that public tracking avoids account/application enumeration. | `admissions.controller.ts:48–108`; public `track` only has a short rate limit. | Review `trackPublicApplication` response fields and lookup proof; use opaque tracking credentials, response minimisation, rate limits by IP/device, and audit/alerting. |
| P2-06 | The academic engine acknowledges that its greedy allocation is not optimal for overlapping tight elective baskets. | `academic-domain-engine.ts:395–403`. | Treat complex overlapping curricula as `PENDING_REVIEW` or implement a solver/backtracking allocator; create adversarial curriculum tests. |
| P2-07 | RLS interceptor deliberately retains a database transaction for the full HTTP request. Provider network calls are bounded, but the architecture still risks pool pressure on any slow authenticated request. | `common/rls/rls.interceptor.ts` comments and request-wide `withRls()` design. | Complete a tested per-operation RLS routing design or size the pool/load test the existing design. Do not partially change it without protected-delegate integration coverage. |

## P3 — hygiene, maintainability, and release-discipline issues

| ID | Finding | Evidence | Remediation |
| --- | --- | --- | --- |
| P3-01 | Migration prefixes remain non-contiguous (`0021` absent) and duplicated (`0024_*` twice); a deferred partition migration is prefixed `9000`. | Migration inventory. | Maintain an immutable migration-history registry. If no environment has applied the chain, consolidate/renumber once before first deployment; otherwise never rename recorded migrations. |
| P3-02 | The archive includes standalone JavaScript load-test/config scripts and operational JavaScript files. These are not inherently unwanted, but should be explicitly classified and linted rather than treated as accidental generated artifacts. | `tests/k6/*.js`, `apps/api/ecosystem.config.js`, `tooling/*/index.js`. | Keep intentional JS under documented tooling directories; add lint/check ownership and ensure release archives exclude generated reports/results. |
| P3-03 | Several raw/system database interfaces exist (`DirectPrismaService`, `runSystem`, unsafe raw query surface). The scan did not prove an exploit, but each is a high-impact boundary requiring allow-listing and call-site review. | `database/direct-prisma.service.ts`; privileged usage scan. | Restrict privileged functions to worker/CLI modules, add static allow-list enforcement, and cover all exception paths in RLS integration tests. |
| P3-04 | The dynamic-code rule is a grep tripwire, not a semantic security control. | `p4:verify-rules` command. | Retain it as defence-in-depth, but add ESLint security rules and review dependency/SAST results. |
| P3-05 | The archive’s success claims should not be conflated with production certification. Schema/client generation, web type checking, utilities tests, dynamic-code gate, and deployment topology validator passed; API type checking failed. | Verification commands in this audit. | Make API type check and real integration/E2E tests mandatory release gates; publish only the exact evidence achieved. |

## Verification record

| Check | Result |
| --- | --- |
| Archive integrity | Passed |
| Locked dependency installation | Passed |
| Prisma schema validation and client generation | Passed |
| API type check | **Failed** — 4 AcademicService integration errors |
| Web type check | Passed |
| Shared utility suite | Passed — 5 suites, 34 tests |
| Dynamic-code tripwire | Passed |
| Deployment artifact validator | Passed |
| API E2E suite | Not executed to application level; fails at fail-closed environment validation because required test secrets/database variables are absent |
| Live PostgreSQL/RLS/API/worker rehearsal | Not available in this audit environment |

## Remediation sequence

1. **Stop release packaging** until P0-01 is fixed and full API type checking passes.
2. **Correct the academic source of truth**: map approved exceptions and scoped policy versions into degree audit/progression; then add authoritative, auditable approval/application state machines.
3. **Make lifecycle writes atomic and unique**: degree audit + plan, one active plan, one progression decision per student/period/policy version, and idempotent TSA/provider creation.
4. **Close authorization gaps** with endpoint/service/RLS alignment and real database negative tests.
5. **Build certification infrastructure**: disposable PostgreSQL+pgvector/Redis, seeded roles/users, RLS matrix, concurrent transactions, payment failure ordering, and critical browser journeys.
6. **Only then** run load, backup/restore, real provider sandbox, and pilot-institution certification.

> **Release decision:** The academic-lifecycle archive should be considered a development/audit candidate, **not deployable production code**, until the P0 compile defect and P1 academic/financial correctness defects are repaired and proven against a real database.


## P1 continuation update — 14 August 2026

A second pass over the integrated release found and repaired several residual P1 edge cases that were not safe to leave as documentation-only risks.

| Residual P1 edge case | Implemented repair | Evidence |
| --- | --- | --- |
| Elective and credit-basket deficits could remain invisible because the API parsed only compulsory-course reason strings. | `RequirementGroupResult` now emits `unmetRequirementIds`; the API persists unmet group evidence and maps unsatisfied catalog requirements into plans. Generic baskets remain explicitly represented as review groups without inventing course rows. | Domain engine test and AcademicService elective-plan test pass. |
| Approved-exception queries accepted rows with only `status=APPROVED`, and equivalencies lacked approval provenance filtering. | Exemptions, substitutions, transfers, equivalencies, and active academic policies require approval metadata; exception records are additionally restricted to the current curriculum/course catalog. | Source contract gate checks approval filters; focused academic tests pass. |
| Payment idempotency compared key, fee, student, and provider but not requested amount. | Existing payment amount is compared before replay/resume; changed amount/provider/fee/student receives `IDEMPOTENCY_KEY_REUSED` before provider I/O. | Payment regression test passes. |
| Conditional and eligible progression actions could be recorded without any placement recommendation. | Every progression outcome now produces a deterministic recommended placement; promotion actions target the next 100-level, repeat retains the current level, and standing suspension overrides progression action. Existing decisions without placements are backfilled. | AcademicService placement suite passes. |
| Approved interruptions had no completion/resumption path and could leave students indefinitely deferred. | Authorized resumption endpoint and transaction restore a deferred student to `ACTIVE` only after the end date, then mark the interruption `COMPLETED`. | AcademicService interruption-resumption test passes. |
| Current-student journey/audit views could display an audit or plan from a superseded curriculum. | Latest audit and active-plan queries are scoped to the student's current curriculum version. | API type check and focused service tests pass. |

The integrated source now also includes `p1:verify-academic-integrity`, a static contract gate covering 11 academic and payment invariants. Live PostgreSQL/RLS, provider sandbox, load, and restore evidence remain environment gates rather than claims made by source-level tests.


## P2 continuation update — 14 August 2026

The P2 pass closed the remaining source-level public-surface and academic-engine gaps and formalized the operational certification contract.

| P2 finding | Updated disposition | Evidence |
| --- | --- | --- |
| **P2-05** public tracking could permit application enumeration through application number plus email. | **Resolved at source level.** Public status now requires a 64-character HMAC-derived tracking credential issued once at application submission; lookup uses a generic failure response, constant-time verification, response minimization, and existing throttling. The applicant web flow was updated accordingly. | Admissions service tests pass; P2 operational contract gate passes. |
| **P2-06** bounded greedy/backtracking allocation could publish a non-optimal overlapping-basket result. | **Resolved at source level.** If the bounded search budget is exhausted without proving a satisfactory allocation, the engine marks unresolved groups as reviewable and returns `PENDING_REVIEW` rather than an authoritative denial. | Adversarial overlap test passes. |
| **P2-07** request-wide RLS transactions can hold a pool connection during provider I/O. | **Controlled and documented.** Provider initiation already uses the explicit request-transaction skip contract; local reservation and final update use protected operation transactions. The deployment guide and P2 contract gate now require this route contract and retain live pool/load testing as a certification gate. | Payment controller contract check passes; live pool sizing remains environment-dependent. |
| **P2-03/P2-04** live E2E/RLS/restore evidence absent from the sandbox. | **Partially resolved.** The hermetic runner and disposable compose topology remain included, and P2 contract validation verifies their presence. Docker-backed execution, RLS identity matrix, load/pool sizing, provider failure ordering, and restore rehearsal still require a Docker-capable or managed staging environment. | P2 contract gate passes; execution is not claimed in this environment. |

The P2 release adds `p2:verify-operational-contract`, which validates nine invariants covering public tracking proof, fail-closed secret handling, throttling, adversarial allocation review, provider transaction skipping, and hermetic E2E assets.
