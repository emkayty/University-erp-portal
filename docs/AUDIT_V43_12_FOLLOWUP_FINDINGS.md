# UniPortal ERP V43.12 — Follow-up Forensic Findings and Disposition

**Review date:** 15 August 2026  
**Compared against:** V43.11 integrated-certification candidate  
**Disposition:** Targeted P1 repairs implemented; controlled staging candidate; not production-certified

## Executive disposition

The follow-up identified four genuine source-level defects above the remaining certification checklist: DSR erasure ordering and identity durability, provider-worker false success, registration-calendar fail-open behavior, and graduation concurrency. These were implemented as targeted repairs. The review also confirmed that many older findings are closed and should not be repeatedly carried forward as missing implementations.

## Implemented repairs

| Finding | V43.12 repair | Coverage |
|---|---|---|
| DSR hard-delete/FK failure and User-centric compliance record | Added optional canonical `subjectPersonId`, nullable `subjectUserId` with `ON DELETE SET NULL`, explicit DSR statuses for verification, partial completion, legal hold, and failure, and migration `0041_privacy_subject_identity_v43_12`. DSR rows are created before rectification, erasure, restriction, and export processing. Erasure finalizes the durable row as `COMPLETED` or `LEGAL_HOLD`, and records `FAILED` on processing failure. | Privacy service tests now assert durable-create → destructive-action → final-update ordering and no old-email disclosure. |
| JAMB/WAEC unavailable-provider false success | Admissions worker now calls a transaction-safe AdmissionsService method that moves the applicant to `REVIEW_REQUIRED` when appropriate, writes `admissions.manual_verification_required` through the outbox, and routes a terminal admissions work item. It no longer logs “manual verification” and silently completes without a durable state. | New `admissions-ops.processor.spec.ts` covers JAMB, O’Level, and routed manual-work-item behavior. |
| Registration calendar fail-open and duplicated add/drop logic | Added shared `assertRegistrationWindow()` logic. Registration and drop-course now fail closed when the active calendar or authoritative open/close pair is missing, pair multiple periods deterministically, honor effective open-event end dates, and use operation-specific errors. | StudentsService tests cover missing close event and expired open-event range. |
| Graduation double-processing race | Graduation now acquires a student-specific advisory transaction lock before loading candidate/status and re-evaluating academic eligibility, degree audit, and clearance. Student status, academic history, alumni creation, candidate status, audit, and outbox write remain in the same transaction; alumni creation is already idempotent. | Existing graduation suite updated for lock-first behavior; lock and failure paths pass. |

## Confirmed closed or downgraded findings

The review confirms that fee-waiver locking, refresh-token rotation, SUPER_ADMIN cap transactionality, fail-closed RLS misuse, deterministic reconciliation scheduling, distributed throttling, report-storage validation, safe redirects, LMS completed-registration restrictions and offering scope, response envelope, Redis health, invoice idempotency, result amendment, ResultVersion history, atomic result-to-CGPA updates, academic plan and placement lifecycle, k6 fixture seeding, E2E/integration discovery, deployment static validation, and static contract gates are implemented. Published-result amendment remains an institutional authority/UAT gate, not a missing source feature.

## Remaining residual gates

RefundRequest/RefundExecution/RefundReconciliation/Chargeback and ledger reversal are still absent and require a governed finance design. Library and Hostel automatic clearance events are not yet wired into StudentClearance. Full Person/DataSubject integration for pre-account Applicants remains incomplete even though user-linked DSRs now retain a canonical Person link when available. WAEC, NECO, NABTEB, NBAIS, and JAMB provider execution remains a live integration/manual-fallback certification requirement. High-stakes timed assessment must remain in the Exams domain unless server-side expiry, autosave, reconnect, forced submission, clock, and tamper rules are implemented.

TeachingAssignment, academic calendar/policy engine, result provenance categories, migration baseline rehearsal, full PostgreSQL RLS matrix, browser E2E, academic/finance lifecycle E2E, backup/restore, DR, load, queue recovery, clinic re-encryption, reporting topology, and institutional UAT remain open evidence gates.

## Validation

The full V43.12 gate passed Prisma generation, 9 workspace type-check tasks, 33 API suites/432 tests, 5 utility/package suites/36 tests, lint, production builds, and deployment-artifact validation. Prisma schema validation passed after supplying local placeholder values for both schema URL variables; no database connection was attempted. The raw validation command initially failed only because those environment variables were absent, not because of schema invalidity.

The release is therefore suitable for controlled staging and certification execution, but must not be labelled production-certified until the live P1 evidence is executed, independently reviewed, and accepted by institutional governance.
