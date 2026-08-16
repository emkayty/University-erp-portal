# UniPortal ERP — Follow-up Forensic Review Findings (V43.8 Candidate)

**Review date:** 15 August 2026  
**Source attachment:** `/home/ubuntu/upload/pasted_content_9.txt`  
**Comparison target:** V43.7 working tree

## Executive assessment

The attachment confirms that the two V43.6/V43.7 material findings remain genuinely fixed: LMS staff offering scope is enforced in source, and admission-clearance policy changes honor their effective timestamp. It also confirms that the remaining architecture is not production-certified, particularly for comprehensive RLS, external providers, refunds, backup/restore, load, and canonical pre-account data-subject identity.

The attachment identified one immediately actionable LMS business-rule refinement and a critical asynchronous reliability gap. The LMS refinement was fixed by separating read visibility from write/participation permissions for completed registrations. The asynchronous gap was partially closed through a targeted durable-outbox routing pass covering critical admissions, finance, reports, privacy, and security-reminder producers.

## Finding dispositions

| Finding | Verification against source | Disposition |
|---|---|---|
| LMS lecturer/HOD/dean scope | `assertStaffOfferingScope()` resolves the offering lecturer, department HOD, and faculty dean and is used across staff operations. | Fixed previously and retained. |
| TeachingAssignment / multiple lecturers / delegation | `CourseOffering.lecturerId` remains the operative teaching relation; no `TeachingAssignment` model exists. | Residual P1/P2 architecture gate. Do not silently invent authority semantics. |
| Adversarial LMS role coverage | Previous tests did not lock down unrelated lecturer/HOD/dean denial and institution-wide registrar/super-admin behavior. | Improved in V43.8 candidate with public-operation adversarial tests. |
| Completed registration permissions | `assertStudentEnrolled()` previously treated `REGISTERED` and `COMPLETED` identically for reads, submissions, quiz attempts, progress, and discussions. | Fixed in source: completed registrations remain viewable but are read-only for submissions, quiz attempts, progress, and discussions. |
| Outbox atomicity wording | PostgreSQL and Redis are independent; enqueue and `processedAt` cannot be one atomic transaction. | Corrected documentation and implemented stable event job IDs with explicit at-least-once semantics. |
| Direct admissions JAMB queue | Application commit was followed by a direct `admQueue.add()`. | Fixed in source: `admissions.jamb_verification_requested` is written in the application transaction and routed by the outbox. |
| Direct finance invoice/reconciliation queues | Invoice generation and Remita reconciliation had direct producer-side queue calls. | Fixed in source: both now write transactional domain events routed to their existing worker queues. |
| Direct reports/privacy queues | Report generation, SAR, and portability created database rows and then directly queued BullMQ jobs. | Fixed in source: ReportJob/DSR rows and domain events commit together; outbox routing preserves worker payload contracts. |
| Direct security reminder queue | Incident creation was followed by direct repeating reminder registration. | Fixed in source: a reminder-scheduling event commits with the incident; the outbox preserves the `breach-<incidentId>` key so manual cancellation remains effective. |
| Outbox consumer idempotency | Existing workers are at-least-once consumers; a universal durable consumer ledger is not yet present. | Improved with stable BullMQ event job IDs and deterministic worker/job contracts; full consumer-side idempotency remains a residual gate. |
| Canonical pre-account DSR subject | `DataSubjectRequest.subjectUserId` remains mandatory and the privacy API remains User-anchored. | Residual P1 privacy architecture gate. |
| RLS cross-user isolation | Current integration evidence proves connection role, forced RLS on selected tables, no-identity zero rows, and transaction-scoped context, but not cross-user read/write matrices. | Residual P1 certification gate. |
| External providers, reconciliation, refunds | Live JAMB/CAPS, examination providers, Remita/Paystack, reconciliation, and refund lifecycle remain uncertified or incomplete. | Residual production gate. |
| Academic-period enforcement and assessment-to-result evidence | Cross-module calendar policy and a complete traceable assessment-to-result chain require broader institutional workflow decisions. | Residual P2 maturity work; no unsafe rewrite in this pass. |
| Published-result amendment workflow | Existing result controls must be verified end-to-end for immutable amendment history and approval sequencing. | Residual P2 integrity certification/maturity gate. |
| Backup/restore, load, cloud, full academic E2E | Not executable as source-only certification in this sandbox. | Residual target-environment gates. |

## Targeted source changes

The V43.8 candidate adds action-aware LMS enrollment checks, adversarial authorization tests, a routed transactional-outbox dispatcher, durable event scheduling for critical asynchronous workflows, and focused OutboxService tests. The outbox route forwards root-level payloads to existing worker contracts, assigns deterministic job IDs, records enqueue failures for retry, and keeps generic notification events on the notification route. Security reminder jobs retain their incident-specific repeat key so `markNitdaNotified()` can cancel them.

The implementation deliberately does not introduce the TeachingAssignment, DataSubject, universal RLS, refund, academic-calendar, or high-stakes examination-engine models without institutional policy, migration governance, and live integration evidence.

## Validation state

Focused validation after the targeted changes passed with 8 suites and 140 tests, including the new outbox routing tests, LMS adversarial authorization tests, completed-registration read-only tests, admissions JAMB event tests, fee invoice-event tests, privacy export-event tests, and security reminder-event tests. API type-check passed after the source changes. Full monorepo validation, lint, production builds, and deployment packaging remain the next gates.
