# UniPortal ERP — V43.9 Follow-up Forensic Findings

**Review date:** 15 August 2026  
**Source attachment:** `/home/ubuntu/upload/pasted_content_10.txt`  
**Comparison target:** V43.8 candidate integration, reliability, and security hardening

## Executive disposition

The attachment independently re-checked the V43.8 archive rather than trusting its release documents. Its positive confirmations are accurate: LMS completed-registration permissions, LMS staff scope, admission-clearance effective dates, critical producer-side outbox conversion, invoice-number idempotency, fee User/Student identity handling, report authorization, response envelopes, Redis health checks, and safe internal login redirects are present in source.

The V43.9 candidate applies targeted fixes to the verified source defects that are safe to close without a broad architecture rewrite. These are the fee-waiver approval race, privacy erasure email disclosure, fail-open RLS bypass convention, super-admin cap write race, payment reconciliation sweep duplicate scheduling, Redis-shared throttling, and production/staging report-storage startup validation.

## Finding matrix

| Finding | Source verification | V43.9 disposition |
|---|---|---|
| LMS completed registrations retained write permissions | V43.8 action-aware enrollment gate is present and tested. | Fixed previously; retained. |
| LMS lecturer/HOD/dean staff scope | `assertStaffOfferingScope()` remains applied across staff-facing operations. | Fixed previously; retained. |
| Admission-clearance effective date | Pending policy fields and due-time matriculation resolution remain present. | Fixed previously; retained. |
| Critical producer-side outbox conversion | V43.8 routed admissions, finance, reports, privacy, and security producer events through the outbox. | Fixed previously; retained. |
| Invoice-number idempotency and User/Student identity | Stable fee invoice derivation and student-linked fee authorization are present. | Fixed previously; retained. |
| Report authorization | `authorizeReportRequest()` enforces role and server-side scope restrictions. | Fixed previously; retained. |
| Response envelope | `ResponseEnvelopeInterceptor` is registered as `APP_INTERCEPTOR` and preserves binary/empty/already-enveloped responses. | Stale finding corrected; not an open defect. |
| Redis production health check | Compose health check passes `REDIS_PASSWORD` to `redis-cli`. | Stale finding corrected; not an open defect. |
| Safe login redirect | `safeInternalRedirect()` rejects external origins. | Fixed previously; retained. |
| Fee-waiver approval race | Approval checked waiver status before locking the waiver row, then locked only the student fee. | Fixed in V43.9 source: waiver row is locked before status read, followed by the student-fee lock for cap/application serialization. |
| Fee-waiver cap serialization | Fee lock already serialized cap calculation and financial application. | Strengthened in V43.9 with explicit dual-lock regression coverage. |
| Privacy DSR canonical subject | `DataSubjectRequest.subjectUserId` remains mandatory and User-anchored; pre-account Applicants are not canonical subjects. | Residual P1 privacy architecture gate; requires a governed Person/DataSubject model and migration policy. |
| DSR request durability | Erasure still creates its DSR inside the mutation transaction, and the User foreign key makes pre-delete durable creation non-trivial. | Residual P1 workflow/data-model gate; do not fake durability by weakening referential integrity. |
| DSR export inventory completeness | Export is broad but no governed table/field/retention/legal-basis inventory exists. | Residual P1 compliance-governance gate. |
| Erasure response discloses old email | `erase()` returned `wasEmail` after pseudonymization/hard-delete. | Fixed in V43.9 source and tests; the response now returns only request/result metadata. |
| RLS bypass warning | Sensitive FORCE_RLS models warned when plain delegates were used during an ambient authenticated request. | Fixed in V43.9 source: the extension now throws `RLS_CONTEXT_REQUIRED` before the query; trusted background operations use DirectPrismaService explicitly. |
| RLS domain coverage | FORCE_RLS remains selective and no live cross-user matrix exists. | Residual P1 security certification gate. |
| RLS transaction lifetime | The global request interceptor retains an ambient transaction across request work. | Residual P1/P2 performance architecture gate; requires staged short-transaction migration and load evidence. |
| Refresh-token rotation | Token consumption already uses Redis Lua/EVALSHA GET+DEL+SREM atomicity. | Fixed previously; attachment finding is stale for this source. |
| SUPER_ADMIN cap race | Cap lock previously ended before create/grant writes. | Fixed in V43.9 source: SUPER_ADMIN cap count and write now share the direct advisory-locked transaction; new tests cover creation and grants. |
| Remita/JAMB/WAEC providers | Workers remain scaffolds or require institution-specific credentials and endpoint certification. | Residual production integration gate. |
| Refund lifecycle | Approval, execution, reconciliation, reversal, chargeback, and ledger workflow is incomplete. | Residual P1 finance gate. |
| Payment reconciliation sweep duplicates | Six-hour sweep directly enqueued without a stable per-payment ID. | Fixed in V43.9 source: `payment-reconcile:<paymentId>` job IDs suppress overlapping duplicate jobs while allowing future retries after retention removal. |
| Distributed throttling | Nest throttling default was process-local. | Fixed in V43.9 source: Lua-atomic Redis-backed `ThrottlerStorage` is wired globally; tests cover shared hits, blocks, and Redis errors. |
| Reporting database fallback | Reporting falls back to the primary database when no replica URL is configured. | Residual production topology gate; fallback remains useful for local development but requires production configuration and load certification. |
| Report S3 fail-late configuration | `ReportArtifactService` rejected missing storage only when a report was generated. | Fixed in V43.9 source: staging and production environment validation requires `S3_REPORTS_BUCKET`; development/test remain flexible. |
| Frontend browser coverage | Web build succeeds, but critical UI journeys lack meaningful Playwright/Cypress coverage. | Residual P1/P2 QA gate. |
| Academic lifecycle E2E | Cross-module applicant-to-alumni and interruption/repeat/resit flows are not fully executable in the source-only gate. | Residual P1 academic acceptance gate. |
| Assessment-to-result evidence | Infrastructure exists, but end-to-end traceability and manual-result controls need live certification. | Residual P1 academic-integrity gate. |
| Published-result amendment workflow | Immutable correction request/version/approval E2E remains open. | Residual P1 academic-integrity gate. |
| Academic calendar policy engine | Calendar authority is not universally consumed by all modules. | Residual P2 architecture gate. |
| TeachingAssignment | Single lecturer relation remains insufficient for co-lecturers, TAs, moderators, and delegated markers. | Residual P2 architecture and authority gate. |
| Production migration baseline | Historical chain is not yet a safe immutable fresh-install/upgrade/rollback baseline. | Residual P1 deployment-governance gate. |
| Clinic plaintext re-encryption | Source encryption exists, but legacy operational re-encryption evidence is absent. | Residual P1 data-protection operation gate. |
| High-stakes examination controls | LMS quizzes are not a certified university examination engine. | Residual P1/P2 examination-integrity gate. |
| Institutional policy history | Effective-date scheduling is fixed, but a full policy-version history is not present. | Residual P2 governance maturity gate. |

## Targeted implementation details

The fee-waiver approval transaction now locks `fee_waivers` before checking status and then locks the associated `student_fees` row before recomputing the institutional cap and applying the amount. A concurrent second approval must therefore observe the committed decision rather than reapplying the amount.

Privacy erasure no longer selects or returns the subject’s email. The result contains the DSR identifier, pseudonymization/hard-delete state, and legal-hold state only. The canonical pre-account subject and durable DSR workflow remain deliberately deferred because the current User foreign key and deletion semantics require a governed schema change.

The RLS extension now fails closed for FORCE_RLS models when an ambient authenticated request transaction exists. The guard does not affect background or seed operations with no ambient request context, which must use the dedicated system connection for trusted cross-user work. A Redis-backed throttler uses one Lua script for hit increment, expiry, and block decision, making rate limits consistent across API replicas.

SUPER_ADMIN creation and new SUPER_ADMIN role grants now perform advisory-lock acquisition, cap count, and the final write in one direct transaction. Reconciliation sweeps use deterministic payment-specific job IDs. Production/staging environment validation rejects startup without report object storage configuration.

## Validation evidence

The complete V43.9 candidate gate passed Prisma generation, all 9 monorepo type-check tasks, 32 API suites with 426 tests, 5 utility/package suites with 36 tests, lint, production builds, and deployment-artifact validation. Focused new-repair tests passed for fee-waiver locking, privacy non-disclosure, super-admin cap transactions, Redis throttling, and existing V43.8 outbox/authentication behavior.

## Release posture

V43.9 is suitable for controlled staging and pre-production certification rehearsal. It is not live university-wide production-certified until the residual RLS matrix, privacy subject model, finance providers/refunds, academic lifecycle, examination integrity, migration baseline, backup/restore, load, browser E2E, cloud deployment, legacy clinic re-encryption, and institutional UAT gates are executed and signed.
