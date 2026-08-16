# UniPortal ERP V43.11 — Integrated Runtime, Academic, Finance and Production Certification Matrix

**Purpose:** Define the evidence required to move from a strong staging candidate to legitimate institutional production certification. This document is an execution plan and evidence contract; it is not itself certification evidence.

> Automated test success, readiness checks, and approved evidence-file validation do not substitute for execution of the underlying live drills.

## Release decision rule

A V43.11 production recommendation may be issued only when every P1 row below has a signed evidence artifact, the artifact records the environment and execution timestamp, the result is `PASS`, the responsible owner is identified, and institutional release governance accepts the residual P2 items or explicitly defers them. A green source-only CI run is necessary but insufficient.

## Evidence matrix

| Gate | Required execution | Minimum evidence | Owner | Blocking |
|---|---|---|---|---|
| PostgreSQL RLS | Run as restricted `uniportal_app` against a seeded staging database. Test different user, department, faculty, offering, revoked-session, and concurrent identities across applicants, applications, documents, results, exams, LMS, fees, payments, payroll, HR, clinic, hostel, library, alumni, DSR, and security incidents. | `rls-runtime-evidence.json` with matrix rows, denied/allowed outcome, SQL/database identity, transaction isolation, executed timestamp, and reviewer. | DBA/Security | P1 |
| DSR identity and durability | Exercise pre-account Applicant, User-linked Student, Staff, legal hold, erasure, rectification, export, rejection, and failure paths. Confirm the compliance record survives subject-account deletion. | Approved data-model decision, migration rehearsal, DSR lifecycle evidence, legal-hold evidence, and governed PII inventory. | DPO/Legal/DBA | P1 |
| Refund lifecycle | Execute full, partial, failed, retried, duplicate, manual, provider, chargeback, reversal, reconciliation, and ledger cases in a provider sandbox. | Refund request/approval/execution/reconciliation records, ledger entries, provider references, idempotency evidence, and exception report. | Finance/Payments | P1 |
| Paystack | Use a non-production fee: checkout/initiation, webhook signature, duplicate/reordered/delayed webhook, confirmation, reconciliation, and provider failure. | Provider lifecycle evidence with request IDs, webhook signatures, payment IDs, reconciliation result, and no-live-money declaration. | Payments/SRE | P1 |
| Remita | Execute institution-approved sandbox RRR/payment/status lifecycle and reconciliation using the merchant product’s documented API contract. | RRR/reference, status responses, webhook or callback evidence, reconciliation outcome, retry/manual fallback evidence. | Payments/Institution | P1 |
| Nigerian admissions providers | Run JAMB/CAPS and applicable WAEC, NECO, NABTEB, NBAIS sandbox/pilot or approved manual fallback workflows. | Request/response reference, timestamp, operator, status, failure reason, data-minimisation review, and exception approval. | Admissions/Registrar | P1 |
| Academic lifecycle | Execute Applicant → Application → O’Level/JAMB → Offer → Acceptance → Clearance → Matriculation → Programme/Curriculum/Semester → Offering/Registration → Finance → LMS → Assessment → Exam → Grade → Result → CGPA → Progression → Degree Audit → Graduation → Transcript → Alumni. | Correlated end-to-end trace, database assertions, audit events, outbox/worker results, and final transcript/alumni record. | Registrar/Academic/QA | P1 |
| Academic branches | Repeat the lifecycle for deferment, interruption/resumption, withdrawal, repeat, carryover, resit, supplementary exam, transfer, substitution, and graduation correction. | Scenario-specific state-transition evidence and policy approval. | Academic/Registrar | P1 |
| Assessment/result integrity | Trace CA, assignment, quiz, and exam evidence to marks, moderation, grade, StudentResult, CGPA, and transcript. Exercise authorized manual result and amendment/version paths. | Assessment-evidence IDs, result-version history, authority/approval, old/new values, CGPA snapshot, and audit/outbox events. | Exams/Registrar | P1 |
| High-stakes examinations | Test server timer, reconnect, autosave, final submission, concurrent sessions, randomization, attempt integrity, incident/malpractice, absence, deferment, resit, and supplementary flows. | Examination control report, tamper/incident results, recovery evidence, and policy sign-off. | Exams/IT/Security | P1 |
| Browser journeys | Execute Playwright journeys for applicant, student, lecturer, registrar, bursar, administrator, and security roles across critical workflows. | Browser trace/screenshots/video, accessibility result, environment, browser version, and defect disposition. | QA/Product | P1 |
| Backup/restore and DR | Perform backup, integrity verification, restore, RTO/RPO, PostgreSQL failover, Redis recovery, worker/queue recovery, application recovery, and cross-service consistency checks. | `backup-restore-evidence.json`, `dr-failover-evidence.json`, queue/Redis recovery logs, measured RTO/RPO, and approver. | SRE/DBA | P1 |
| Performance/load | Run seeded k6 workloads at agreed 500/1,000/5,000-user profiles covering admissions, webhooks, result publication, LMS submissions, and report generation. | `performance-evidence.json` with p95/p99, error rate, DB connections, Redis latency, queue lag, CPU, memory, and capacity decision. | SRE/Performance | P1 |
| Migration governance | Prove fresh install, historical upgrade, backup, restore, rollback/recovery strategy, and migration audit from the immutable baseline. | Migration logs, schema hashes, backup/restore result, rollback decision, and DBA sign-off. | DBA/Release | P1 |
| Queue idempotency/recovery | Kill/restart workers and Redis around admissions, finance, reports, privacy, security, and reconciliation jobs; replay deliveries and confirm no duplicate financial/privacy side effects. | Job IDs, event IDs, retry/dead-letter records, side-effect assertions, and recovery timeline. | SRE/Platform | P1 |
| Clinic re-encryption | Back up, encrypt legacy rows, decrypt-verify, scan for plaintext, restore test, and final verification. | Before/after counts, plaintext scan, checksum/sample verification, backup reference, and DPO sign-off. | Clinic/DBA/DPO | P1 |
| Reporting topology | Explicitly approve reporting replica or primary fallback, run large-report load and isolation checks, and confirm S3/IAM. | Topology decision, load result, S3 access evidence, and operational approval. | Platform/Reporting | P2 |
| TeachingAssignment/calendar/policy history | Approve one-lecturer policy or implement the richer authority model; certify calendar and policy-version consumers. | Governance decision and affected-module matrix. | Academic/HR/Registrar | P2 |

## Evidence-file contract

Evidence files must be generated from the execution environment, not authored merely to satisfy the gate. Each JSON artifact must contain `executedAt`, `environment`, `operator`, `result`, `scope`, `observations`, and `reviewer`. The existing runtime evidence runner may validate structure and approved `PASS` status, but it does not execute the underlying drills.

## Recommended execution order

Begin with the migration baseline and a disposable staging environment. Seed synthetic users and domain records, then execute RLS and queue recovery before provider and academic workflows. Run finance/provider scenarios before finance-to-registration and academic lifecycle E2E. Execute browser journeys against the same traceable staging dataset. Finish with backup/restore, DR, load, and institutional UAT using the exact release artifact proposed for deployment.

## Exit criteria

The system remains **not production-certified** until all P1 evidence is present, reproducible, independently reviewed, and accepted by the institution. V43.11 should not add generic domain modules while these gates remain open; the exception is a governed DataSubject/Person model and refund domain design if the institution approves those as prerequisite product changes.
