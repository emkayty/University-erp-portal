# UniPortal ERP — V43.10 Follow-up Forensic Findings

**Review date:** 15 August 2026  
**Source attachment:** `/home/ubuntu/upload/pasted_content_11.txt`  
**Comparison target:** V43.9 candidate certification hardening

## Executive disposition

The attachment independently confirms the V43.9 source repairs: fee-waiver locking, refresh-token Lua rotation, fail-closed sensitive RLS bypass behavior, SUPER_ADMIN cap transactionality, deterministic reconciliation sweep IDs, Redis-backed throttling, report-storage startup validation, and the retained V43.7/V43.8 LMS, admissions, outbox, invoice, redirect, response-envelope, and report-scope repairs.

The one actionable source/documentation issue in this follow-up is the semantics of the production-certification runner. It previously ended with wording that could be read as completed production certification even though the runtime and provider stages validate approved evidence artifacts and readiness prerequisites rather than independently executing every real-world drill. V43.10 changes the runner and runtime evidence messages to state explicitly that the automated gate passed and that independent provider/runtime evidence and institutional release approval remain required.

## Finding matrix

| Finding | Verification | Disposition |
|---|---|---|
| V43.9 finance, privacy, RLS, authentication, throttling, and report-storage repairs | Confirmed present in source. | Closed and retained. |
| Comprehensive real PostgreSQL RLS matrix | Requires real PostgreSQL, cross-user/cross-scope data, revoked sessions, and concurrency. | Residual P1 certification gate; not honestly executable by source-only mocks. |
| Canonical Person/DataSubject subject | `DataSubjectRequest.subjectUserId` remains User-anchored. | Residual P1 privacy architecture gate. |
| Durable DSR lifecycle | Receipt-before-processing and failure-state semantics require a canonical immutable subject identity and coordinated foreign-key design. | Residual P1 workflow/schema gate. |
| Governed PII inventory and complete export certification | The export is broad but no authoritative table/field/retention/legal-basis/erasure matrix drives it. | Residual P1 compliance-governance gate. |
| Production-certification runner semantics | `production-certification.sh` ran automated checks and ended with “Production certification completed successfully”; runtime/provider scripts accepted approved evidence artifacts and readiness checks rather than executing all underlying drills. | Fixed in V43.10 source/scripts: terminology now says “Automated production-certification gate passed” and explicitly requires independent evidence and institutional release approval. |
| Provider lifecycle certification | External-provider script performs Paystack read-only balance and Remita endpoint reachability/readiness checks; it does not create a charge/RRR or prove webhook/reconciliation lifecycle. | Residual P1 provider certification gate; script messaging remains readiness-oriented. |
| Refund workflow | No complete RefundApproval/RefundExecution/RefundReconciliation/ledger lifecycle exists. | Residual P1 finance gate. |
| Production migration baseline | Deployment intentionally uses controlled `db push` behavior because historical migration baseline is not yet trusted. | Residual P1 schema-governance gate. |
| Academic static contract checks | Academic integrity script checks source invariants, not real DB lifecycle behavior. | Residual P1 academic E2E gate. |
| Academic applicant-to-alumni lifecycle | Full registration/progression/repeat/carryover/interruption/resume/graduation/transcript/alumni workflow is not proven in a real environment. | Residual P1 institutional acceptance gate. |
| Assessment-to-result traceability | Architecture is stronger, but live evidence and authorized manual-result/correction workflows remain to be certified. | Residual P1 academic-integrity gate. |
| Published-result correction/versioning | Immutable correction request, old/new values, approvals, evidence, and audit retrieval remain open. | Residual P1 academic-integrity gate. |
| TeachingAssignment | No model exists for co-lecturers, TAs, moderators, delegated markers, or replacements. | Residual P2 authority/workload architecture gate unless institutional policy explicitly guarantees one lecturer per offering. |
| Academic-calendar centralization | Modules do not yet universally consume one operational calendar policy engine. | Residual P2 architecture gate. |
| Clinic re-encryption | Source encryption does not prove production records have been migrated and plaintext removed. | Residual P1 operational data-protection gate. |
| High-stakes examination controls | LMS quizzes are not a certified examination engine for timing, recovery, concurrency, tamper resistance, exceptions, malpractice, absence, deferment, and resit. | Residual P1/P2 examination-integrity gate. |
| Browser E2E | Playwright configuration exists, but critical journeys remain insufficiently automated. | Residual P1 QA gate. |
| Backup/restore, DR, load, cloud, queue recovery | Scripts and tooling exist, but actual RTO, restore, failover, load, cloud, and queue-recovery evidence is not in the archive. | Residual P1 infrastructure certification gates. |
| Reporting database fallback | Primary database fallback remains acceptable for development but requires explicit production topology decision and load evidence. | Residual P2 production topology gate. |

## V43.10 implementation

`production-certification.sh` now identifies itself as an automated gate, uses consistent eleven-stage numbering, and ends with an explicit statement that independent runtime/provider evidence and release approval are required before institutional certification. `runtime-certification-evidence.sh` now reports that it verifies approved artifacts marked PASS and does not execute or independently certify the underlying drills. The provider script already uses readiness-oriented language and requires operator-approved sandbox lifecycle evidence; that distinction is preserved.

No database migration or broad domain rewrite is justified by this attachment. The remaining items are real, but they require live PostgreSQL/Redis/provider/cloud execution, institutional academic and privacy policy, or a governed schema redesign.

## Validation evidence

V43.10 validation passed Prisma generation, all 9 monorepo type-check tasks, 32 API suites with 426 tests, 5 utility/package suites with 36 tests, lint, production API/frontend/shared builds, deployment-artifact validation, shell syntax checks, and the development skip paths for runtime/provider evidence scripts.

## Release posture

V43.10 is a strong staging / pre-production candidate and an automated certification-gate candidate. It is not legitimately production-certified until the residual runtime, provider, academic, privacy, infrastructure, and institutional UAT evidence is independently executed, attached, reviewed, and approved.
