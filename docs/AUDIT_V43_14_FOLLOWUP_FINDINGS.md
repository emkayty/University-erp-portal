# UniPortal ERP V43.14 — Follow-up Findings and Disposition

**Input:** `/home/ubuntu/upload/pasted_content_15.txt`  
**Baseline:** V43.13 candidate  
**Review date:** 15 August 2026  
**Disposition:** Targeted academic-integrity and cross-module repairs implemented; controlled staging candidate

## Executive disposition

The attachment correctly identified several cross-module academic-integrity gaps that were not closed by the prior privacy/calendar follow-up. The review also correctly confirmed that the previous DSR ordering/FK, unavailable-provider false-success, registration fail-open, graduation race, physical User-delete, Person-intake, and calendar-write findings are now closed or explicitly gated.

The valid new P1/P2 source defects were repaired without creating a broad new module layer. Assessment, Exams, LMS, Results, Outbox, Academic, and Students now share the relevant authorization, provenance, finalization, durable-consumer, and state-transition controls.

## Implemented repairs

| Finding | Disposition | Evidence |
|---|---|---|
| Assessment marks lacked offering scope | Fixed | Added `AcademicOfferingAuthorizationService`; Assessment scheme, component, mark, gradebook, export, upload, finalization, and result-generation paths now require the actor’s offering scope. |
| Exam attendance lacked equivalent scope | Fixed | Timetable, candidate, attendance, report, and class-attendance operations are scoped; STAFF must be the offering lecturer or assigned invigilator, while HOD/DEAN use academic ownership and Registrar/SUPER_ADMIN are explicit overrides. |
| No exam-mark path into results | Fixed in targeted form | Added `RecordExamMarkDto` and `POST /exams/timetable/:id/marks`; entry requires an eligible candidate, PRESENT/LATE attendance, an active EXAM component, and scope authorization. Migration 0042 persists nullable `AssessmentMark.examTimetableId`. |
| Exam evidence was not traceable in result output | Fixed | Gradebook and `StudentResult.assessmentEvidence` now carry `examTimetableId` for marks sourced from an exam timetable. |
| Assessment finalization was incomplete | Fixed in source | Added controlled finalization for complete marks; finalized marks cannot be edited through ordinary entry; draft result generation rejects unfinalized marks. Amendment/moderation/approval authority remains a live governance gate. |
| Progression refresh event had no academic consumer | Fixed in source | Added `academic-progression` queue, Outbox routing with deterministic job IDs, actor propagation from Senate publication, and `AcademicProgressionProcessor` invoking the existing lock-protected `runProgression()` engine. |
| Reinstatement resurrected stale registrations | Fixed in source | Reinstatement restores only ON_HOLD registrations attached to the current active academic period. Historical completed periods are not revived. |
| Student status changes lacked an FSM | Improved in source | Added explicit allowed transitions and required a reason for every status action; GRADUATED and invalid transitions are blocked. |

## Confirmed closed or retained findings

CAPS matriculation gating, geographic reference architecture, O’Level reference direction, course-offering relational integrity, degree-audit calculation, graduation transaction locking, LMS-to-assessment coursework integration, RLS fail-closed plumbing, E2E discovery safeguards, and static certification gates remain confirmed or retained from prior reviews.

## Residual gates

The targeted ExamMark integration is provenance-aware but does not claim a complete exam-board domain. Invigilator assignment lifecycle, seat allocation, script capture, marking batches, moderation, result approval, Senate publication governance, and institutional examination UAT remain required. A formal controlled amendment workflow is still required for finalized AssessmentMark corrections.

Refund approval/execution/reconciliation, chargebacks, ledger reversal, and refund-to-clearance-to-registration transactional evidence remain a P1 finance gap. Real JAMB/CAPS and WAEC/NECO/NABTEB/NBAIS provider lifecycles, stronger external-verification evidence, migration baseline and rollback rehearsal, PostgreSQL/RLS adversarial testing, integrated E2E, browser E2E, backup/restore, DR, Redis/queue replay, load, clinic re-encryption, reporting topology, shared clearance policy, complete pre-account privacy processing, and institutional UAT remain open.

## Validation evidence

| Gate | Result |
|---|---:|
| API tests | 36 suites, 453 tests passed |
| Utility/package tests | 5 suites, 36 tests passed |
| Workspace type-check | 9 tasks passed |
| Lint | Passed |
| Production builds | API and web passed |
| Deployment artifact validation | Passed |
| P1 academic-integrity static gate | 11 invariants passed |
| P2 operational-contract static gate | 9 invariants passed |
| Prisma generation and validation | Passed with local placeholder URL variables |
| Focused new academic-integrity tests | 5 suites, 45 tests passed |

The expected outbox Redis-failure log is produced by a resilience test. The Next.js middleware-to-proxy message is a non-blocking framework deprecation warning. No live PostgreSQL, Redis, provider, RLS, load, backup/restore, DR, or institutional certification is claimed.

## Release posture

V43.14 is **controlled staging / pre-production ready**. It must not be labelled **Production Ready** or **Certified for Institutional Use** until the residual live gates are executed, independently reviewed, and signed by the responsible owners.
