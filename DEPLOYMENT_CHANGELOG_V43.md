# UniPortal ERP V43 Deployment Preparation Changelog

## Release status

This deployment-preparation wave converts the hardened V43 source tree into a portable release for localhost, standard development, production-like Docker Compose, Render/Vercel, Google Cloud Run, AWS ECS/Fargate, generic Docker platforms, and private VPS deployments.

## Deployment assets added or updated

| Asset | Change |
| --- | --- |
| `docker-compose.local.yml` | Added a low-memory Intel Mac profile containing only `pgvector/pgvector:pg16` and Redis 7, with named volumes, health checks, and conservative CPU/memory limits. |
| `docker-compose.yml` | Standard development PostgreSQL now uses the pgvector image; pgAdmin and Redis Commander remain behind the development-only `tools` profile. |
| `docker-compose.e2e.yml` | Ephemeral end-to-end PostgreSQL now uses pgvector for consistency with the application schema. |
| `.env.example` | Synchronized with the V43 environment schema, including `API_PREFIX`, `S3_ENDPOINT_URL`, `S3_FORCE_PATH_STYLE`, storage buckets, Redis/TLS settings, privacy controls, deployment variables, and optional test/seed variables. |
| `apps/api/.env.example` | Synchronized with the API runtime contract and database-role separation. |
| `scripts/package-release.sh` | Added reproducible ZIP packaging with SHA-256 output and explicit exclusion of caches, dependencies, build output, test output, Git metadata, logs, temporary files, and populated environment files. |
| `MACBOOK_LOCALHOST_QUICKSTART.md` | Rewritten for Node 22, pnpm 9.15, Docker Compose v2, Docker-only PostgreSQL/Redis, native application processes, low-memory operation, and Intel Mac troubleshooting. |
| `DEPLOYMENT_GUIDE.md` | Rewritten as a current deployment runbook covering local, development, Compose, Render/Vercel, Cloud Run, ECS/Fargate, generic Docker, secrets, schema deployment, packaging, and acceptance controls. |
| `RECOMMENDATION_REVIEW_V43.md` | Added the source-by-source comparison of the attached recommendations, accepted findings, rejected/stale claims, implemented remediations, and remaining live-certification gates. |
| Admissions eligibility engine | Made O’Level policy configurable, counted distinct credited subjects across combined sittings, enforced alternatives and age/documents, and made bulk dry-run/read-write behavior consistent. |
| Public admissions form | Added emergency-contact and previous-education capture using existing backend DTO contracts. |
| Audit/Pact/seed tooling | Removed hardcoded audit roots, normalized query matching, made Pact provider discovery filename-independent, and made reference seeding deterministic/offline. |

## Important operational decisions

The MacBook profile does not run the API, worker, web application, pgAdmin, or Redis Commander inside Docker. This avoids unnecessary Docker Desktop memory pressure on 4–8 GB Intel hardware. The API, worker, and web process remain separately startable with pnpm.

PostgreSQL uses the pgvector image across local, development, e2e, and production Compose profiles because the Prisma schema and hardening workflow require the `vector` extension. The database schema remains deployed through the controlled non-destructive `scripts/db/deploy-schema.sh` workflow; `prisma migrate deploy` and `--accept-data-loss` remain intentionally disallowed for this release line.

The web application continues to require `NEXT_PUBLIC_API_URL` at build time. API deployments must set the exact browser origin in `FRONTEND_ORIGIN`. The queue worker remains a separate singleton process until distributed scheduler locking is designed and tested.

## Validation

The deployment-preparation changes were validated with:

- Frozen pnpm installation from the lockfile.
- Monorepo type-check: 9 Turbo tasks passed.
- Serial test execution: 408 API tests across 29 API suites and 36 utility tests passed; the web package correctly reported no unit tests.
- Lint: all configured Turbo lint tasks passed.
- Production build: all configured Turbo build tasks passed.
- Offline YAML parsing: all four Compose files parsed successfully.
- Release packaging: archive creation and SHA-256 verification passed; the test archive was approximately 4.9 MB and contained no prohibited cache, dependency, build, test, Git, or populated environment paths.

A Docker runtime rehearsal was not executed in the sandbox because Docker Compose is unavailable there. The target MacBook or deployment host should run the Compose syntax checks and the localhost health checks in the accompanying guides before accepting real data.

The release classification remains **controlled staging / pre-production ready**, not unrestricted production-certified. Live RLS role isolation, Redis and worker behavior, object storage, provider integrations, backups/restoration, and browser deployment still require environment-specific certification.


## Second forensic review remediation — V43.1

The second forensic attachment was compared against the post-deployment-preparation source tree. Confirmed issues were implemented without weakening existing controls:

- Public application submission now derives `admissionType` from the selected admission cycle, rejects conflicting legacy values, and has regression coverage for both omission and conflict.
- Applicant and guardian phone validation now accepts Nigerian local numbers and international `+countrycode` numbers, with updated public-form guidance.
- Automated O’Level eligibility and the staff eligibility endpoint now use verified sittings only. A staff verification endpoint persists reviewer state, timestamp, and remarks.
- A staff-only manual JAMB verification endpoint now records score, verified status, and audit metadata while provider integration remains explicitly manual until institution-owned credentials/MOU are available.
- Privacy portability now resolves linked applicants through Student → User rather than comparing Person and User identifiers. Export coverage includes applicant/person graph data. Retained-user erasure now pseudonymizes the wider applicant graph and sensitive admission identifiers.
- Deterministic seed reference data now includes NBAIS Tahfeez and distinct NABTEB NTC, NBC, ANTC, and ANBC examination types.
- AWS CodeDeploy now packages the complete runtime workspace, builds shared packages, generates Prisma, installs dependencies before schema deployment, uses the controlled `db push`/hardening workflow, corrects PM2 compiled entrypoints, and probes the API on port 3001.
- CI integration PostgreSQL is explicitly aligned with pgvector. The remaining AWS CloudFront/Next.js origin decision is recorded as an open architecture gate rather than silently certified.
- `RELEASE_STATUS.md` was added as the authoritative register for fixed findings, residual risks, owners, and external certification gates.

The updated release remains **controlled staging / pre-production ready**, not certified for live public admissions. CAPS lifecycle, a consolidated Prisma baseline, standalone applicant DSR subjects, live provider integrations, cloud execution, RLS/concurrency/backup testing, and load testing remain explicit gates.

## Updated validation

After the second-review changes, 9 Turbo type-check tasks passed, 28 API suites with 401 API tests passed, 36 utility tests passed, the focused admissions suite passed 23 tests, lint passed, production builds passed, deployment-artifact validation passed, shell syntax validation passed, and all Compose/AppSpec YAML files parsed successfully.


## Third forensic review remediation — V43.2

The third forensic attachment was independently compared against the V43.1 source and deployment configuration. Confirmed security and correctness findings were implemented. Alumni profile reads and writes now enforce ownership, private-profile authorization, administrator override, and public field minimization. Audit-summary and clinic `patients/me` literal routes now precede same-shape parameter routes.

The AWS API topology now consistently uses port 3001 across ALB target groups, security groups, health checks, and smoke tests. The ALB uses the public `/api/health/live` liveness path, while readiness is available to infrastructure probes and detailed health/integration diagnostics remain privileged. The EC2/Server CodeDeploy role now uses the EC2-compatible service-role policy, and the unsupported 10%-for-5-minutes canary claim was removed in favor of the actual blue/green `OneAtATime` configuration.

Admission application-number allocation now occurs within the same advisory-lock transaction as applicant/application creation. Idempotency conflicts now attempt bounded replay of the committed application result. O’Level rows within one sitting must have consistent metadata, and controlled examination references derive the canonical exam classification instead of allowing contradictory duplicate semantics.

Clinic genotype, allergies, and chronic conditions are now encrypted at the application layer. Authorized patient-profile reads decrypt them, while list and appointment-summary paths omit sensitive allergy data. The Patient schema accommodates ciphertext. Existing plaintext rows remain readable only for migration compatibility and require a controlled re-encryption pass in the target environment.

The updated release register records selective RLS, applicant/person DSR architecture, Next.js AWS origin selection, migration-baseline work, provider integrations, refunds, CAPS, backup/restore, and load testing as genuine remaining gates. The final validation passed with 9 type-check tasks, 29 API suites/408 API tests, 36 utility tests, lint, production build, deployment-artifact validation, YAML parsing, and shell syntax checks. The release classification remains **controlled staging / pre-production ready**, not unrestricted production-certified.


## Fourth forensic review remediation — V43.3

The fourth attachment was checked against the current V43.2 source. Its previously reported alumni, audit-summary, AWS ALB, health, CodeDeploy IAM, smoke-test, application-number, idempotency, O’Level, clinic-encryption, and readiness issues were already fixed in V43.2 and were not redundantly changed.

One additional route-ordering defect was confirmed and fixed: the exam timetable bulk attendance route now precedes the per-student `:studentId` route, preventing `bulk` from reaching UUID parsing. The disaster-recovery workflow and queue-health script also stopped calling stale protected `/api/health` and now use the public `/api/health/ready` endpoint. Normal CI readiness calls were already correct.

The release documentation continues to distinguish source-level readiness from live certification. The migration baseline, comprehensive RLS, canonical applicant/person DSR subject model, AWS Next.js origin decision, provider certifications, refund workflow, CAPS lifecycle, and SSH-to-CodeDeploy retirement remain explicit staging or governance gates.

The fourth-review validation passed with frozen install, Prisma generation, 9 type-check tasks, 29 API suites/408 API tests, 36 utility tests, lint, production build, deployment-artifact validation, shell syntax validation, and YAML parsing for all deployment workflows and Compose/AppSpec files.

## V43.4 — Fifth forensic academic-lifecycle remediation (15 August 2026)

V43.4 applies the fifth forensic review’s confirmed cross-module lifecycle repairs. The release remains a controlled staging / pre-production build and is not a claim of live institutional certification.

### Academic lifecycle and admissions

Matriculation now uses the accepted `AdmissionOffer` programme as the authoritative placement record, rejects missing placement, and accepts both `ACCEPTED` and the FSM’s explicit `CLEARANCE` state. Applicant records now carry an independent `CapsAdmissionStatus` plus CAPS reference, programme, institution, approval, candidate-acceptance, and synchronization timestamps. UTME, DE, and TRANSFER matriculation requires CAPS candidate acceptance at source level; real CAPS provider synchronization remains an operational gate.

Course offerings now have the persisted `CourseOfferingLifecycle` state machine from `PLANNED` through publication, registration, teaching, assessment, examination, grading, result publication, completion, or cancellation. Migration `0030_course_offering_lifecycle_v43_4` preserves the legacy meaning of existing active offerings as `REGISTRATION_OPEN` and inactive offerings as `CANCELLED`. A role-protected transition endpoint audits state changes, and registration requires the offering to be open.

### Assessment, examinations, and results

Registration enforces `maxStudents` while holding the existing per-student advisory lock. Examination attendance is read during draft-result generation, and `ABSENT`/`NO_SHOW` records set `StudentResult.absentFromExam`. CGPA, transcript, and semester-report aggregation reject mixed grading-system snapshots. Draft results now preserve active assessment scheme/component metadata, raw marks, versions, and calculated score in `assessmentEvidence`.

Optional assessment components no longer make a gradebook incomplete when no mark exists. Senate publication emits `result.published` and `academic.progression.refresh_requested` outbox events atomically alongside the existing notification-compatible event and CGPA recomputation.

### Finance, LMS, and academic progression

`StudentFee.semesterId` provides period-aware clearance linkage, and registration checks outstanding fees for the selected semester with a legacy boolean fallback for older unlinked rows. LMS content now supports availability windows, due dates, late-submission policy, late-penalty metadata, maximum attempts, and optional assessment-component linkage. LMS submissions use immutable attempt history with advisory-locked numbering rather than overwriting a single row. Grading a linked submission upserts the corresponding `AssessmentMark`.

Graduation candidate creation and final graduation now require the latest current-curriculum `DegreeAudit` to be `ELIGIBLE` in addition to the separate administrative-clearance checks. Suspension and deferment place active registrations on `ON_HOLD`, invalidate active plans and degree audits, and can restore held registrations/plans on reinstatement. Withdrawal drops registrations and marks plans withdrawn. Bulk exam attendance batches user and candidate validation to remove repeated read queries.

### Schema migrations

The release adds migrations `0030_course_offering_lifecycle_v43_4`, `0031_caps_admission_state_v43_4`, `0032_lms_attempt_policy_assessment_link_v43_4`, `0033_result_assessment_evidence_v43_4`, `0034_semester_fee_clearance_v43_4`, and `0035_registration_on_hold_v43_4`. Deploy these migrations through the project’s controlled schema process; the historical migration-baseline limitation remains documented in `RELEASE_STATUS.md`.

### Validation evidence

Frozen dependency installation, Prisma generation, 9 monorepo type-check tasks, 29 API suites with 410 API tests, lint, API build, Next.js frontend build, and deployment-artifact validation all passed. Residual gates include live PostgreSQL/RLS role certification, real CAPS/JAMB/provider execution, backup/restore, load testing, cloud-origin selection, and institutional production sign-off.


## V43.5 — Sixth forensic cross-module remediation (15 August 2026)

V43.5 responds to the sixth independent re-evaluation of the V43.4 archive. The academic core remains substantially hardened; this wave targets remaining business-rule ambiguity and silent asynchronous failure modes. The release remains controlled staging / pre-production ready.

### Admission and finance policy

`InstitutionSettings.requireAdmissionClearance` now defaults to true, making `ACCEPTED → CLEARANCE → MATRICULATED` the production path. A documented institutional exception can explicitly disable the requirement rather than bypassing it accidentally. `FeeClearancePolicy` now makes registration behavior explicit: `SEMESTER_REQUIRED`, `ANNUAL_CLEARANCE`, or `NO_FINANCIAL_GATE`. The production default is semester-specific clearance and missing semester fee rows no longer silently fall through to the legacy `Student.feeCleared` flag.

### LMS and examination semantics

Quiz attempts now use `CourseContent.maxAttempts` under an advisory lock. Quiz start and submission enforce availability end, due date, and late-submission policy, and `QuizAttempt.submittedLate` records the result. Draft result generation now gives ABSENT/NO_SHOW candidates an effective zero score and canonical `ABS` grade with zero grade points while preserving the raw source score in assessment evidence.

### Course applicability

Course offerings can now be optionally scoped to a `CurriculumVersion`. Creation validates the audience reference, registration rejects a mismatched curriculum audience, and nullable scope remains available for shared courses, GST, and institution-wide offerings. Migration `0038_course_offering_audience_v43_5` adds the relation and index.

### Privacy export reliability

Privacy custom reports now fail explicitly when the subject is missing or the report kind is unsupported instead of producing an apparently successful empty export. The report worker synchronizes the linked DataSubjectRequest to `COMPLETED` on success and `REJECTED` on failure. This improves failure truthfulness while live NDPA/domain-completeness certification remains an operational gate.

### Schema migrations

V43.5 adds migrations `0036_admission_clearance_policy_v43_5`, `0037_quiz_attempt_policy_v43_5`, `0038_course_offering_audience_v43_5`, and `0039_fee_clearance_policy_v43_5`. The fee-policy migration creates the expected PostgreSQL enum before adding the settings column. The historical migration-baseline limitation remains documented in `RELEASE_STATUS.md`.

### Validation evidence

Prisma generation, 9 monorepo type-check tasks, 29 API suites with 412 API tests, lint, production API/frontend builds, and deployment-artifact validation passed. Remaining gates include live JAMB/WAEC/identity/O-Level providers, PostgreSQL/RLS matrices, browser E2E, queue reliability conversion, report worker scope, adversarial finance concurrency, load testing, backup/restore, and institutional production sign-off.


## V43.6 — Seventh forensic final hardening (15 August 2026)

V43.6 responds to the seventh direct source verification of V43.5. The prior V43.5 academic repairs were confirmed genuine. This wave closes the one material remaining source defect and adds targeted governance and policy-invariant controls without starting another broad feature rewrite.

### Course-offering capacity concurrency

Registration now acquires the existing student advisory lock and then obtains deterministic offering-scoped locks named `course-offering-capacity:<offeringId>` in sorted order. Capacity counts and registration inserts therefore serialize across different students competing for the same offering. `REGISTERED` and `ON_HOLD` occupy seats; historical `COMPLETED` registrations do not. Regression coverage verifies the lock ordering and status predicate.

### Admission-clearance governance

Changing `InstitutionSettings.requireAdmissionClearance` now requires a distinct active VC or Registrar approval reference, a reason of at least 10 characters, and an effective timestamp. The approver cannot be the settings actor, and the decision metadata is written to the settings audit record. Ordinary settings updates remain backward-compatible.

### LMS policy invariants

LMS content creation now rejects invalid timestamps, availability starts after ends, due dates before availability starts, and due dates after availability ends. The release documents `availabilityEnd` as the absolute hard cutoff; late submissions are only meaningful when the due date and availability window are configured coherently.

### Deferred findings and certification gates

The single nullable curriculum audience remains an intentional interim model; a multi-audience `OfferingAudience` relation is deferred until shared multi-programme offerings require it. Excused, medical, and approved-exception absence semantics remain Registrar/Senate policy gates rather than being guessed in source. Pre-account applicant DSR subjects, annual financial-clearance authority, TeachingAssignment/workload, central workflow, accreditation/QA, SIWES/practicum, and outcome/competency mapping remain planned maturity work.

Live JAMB/CAPS, WAEC/O’Level, Remita, Paystack, SMTP/SMS, object-storage, PostgreSQL/RLS, queue/outbox, programme-transfer E2E, browser E2E, backup/restore, load, cloud rehearsal, and institutional sign-off remain open certification gates. The release does not claim production certification.

### Validation evidence

V43.6 passed Prisma generation, 9 monorepo type-check tasks, 29 API suites with 415 API tests, lint, production API/frontend builds, and deployment-artifact validation. The release classification remains controlled staging / pre-production ready.


## V43.7 — Eighth forensic LMS authorization and policy scheduling remediation (15 August 2026)

V43.7 applies two targeted source-level repairs identified by the eighth forensic review. The release remains controlled staging / pre-production ready and does not claim live institutional certification.

### LMS offering-scope authorization

Staff-facing LMS operations now enforce the actor’s relationship to the target `CourseOffering` before returning or mutating staff data. The shared `assertStaffOfferingScope()` guard permits a STAFF actor only when they are the offering lecturer, a HOD only when they own the offering’s department, and a DEAN only when they own the offering’s faculty. REGISTRAR and SUPER_ADMIN retain institution-wide authority. The guard covers course content, announcements, quiz-question authoring and reads, submission and quiz-attempt marking, submission attachment access, and discussion operations. Controller routes pass the authenticated subject and role into the service layer.

### Scheduled admission-clearance policy activation

Future approved changes to `InstitutionSettings.requireAdmissionClearance` are now stored as pending values instead of being applied immediately. The pending value, effective timestamp, and governance approval document reference are persisted in the new fields `pendingAdmissionClearance`, `pendingAdmissionClearanceEffectiveAt`, and `pendingAdmissionClearanceApprovalRef`. Matriculation resolves the pending policy only when its effective timestamp is due; immediate or already-effective changes continue to apply directly and clear stale pending values. The settings DTO distinguishes the approver user UUID from the governance document reference.

### Schema migration

Migration `0040_scheduled_admission_clearance_policy_v43_7` adds the three nullable scheduling fields to `InstitutionSettings`. Deploy it through the project’s controlled schema workflow. The historical migration-baseline limitation remains documented in `RELEASE_STATUS.md`; this wave does not switch the release line to an unverified fresh-baseline strategy.

### Validation evidence

Prisma generation, all 9 monorepo type-check tasks, the focused LMS and StudentsService suite with 49 tests, the complete serial monorepo test run, lint, production API/frontend builds, and deployment-artifact validation passed. Docker runtime rehearsal, live PostgreSQL/RLS role isolation, provider certification, queue durability, storage/payment certification, browser E2E, backup/restore, load, and institutional sign-off remain environment-specific acceptance gates.


## V43.8 candidate — Integration, reliability, and security certification hardening (15 August 2026)

This follow-up wave responds to the forensic attachment that re-checked V43.7. The release remains controlled staging / pre-production ready and is not a claim of live institutional certification.

### LMS registration-state permissions

LMS enrollment now distinguishes historical visibility from write/participation permissions. A `COMPLETED` registration may view course content, announcements, historical submissions, and progress, but cannot submit assignments, start or submit quiz attempts, update progress, or create discussion posts. New adversarial coverage verifies lecturer, HOD, dean, registrar, and super-admin offering-scope behavior through public staff operations.

### Critical asynchronous workflows

The shared outbox dispatcher now routes durable domain events to the existing admissions, invoice-generation, payment-reconciliation, report-generation, breach-notification, and notification queues. The following producer paths no longer perform a direct post-commit queue handoff: JAMB verification after application creation, fee invoice generation, Remita reconciliation callbacks, general report generation, privacy SAR exports, privacy portability exports, and NITDA reminder scheduling.

The dispatcher forwards root-level payloads compatible with the existing worker contracts, adds a stable `domain-event:<eventId>` job ID by default, preserves the `breach-<incidentId>` key for manual reminder cancellation, and records enqueue failures by leaving the domain event pending while incrementing its retry metadata. PostgreSQL and Redis are not treated as one atomic transaction; the documented guarantee is at-least-once delivery, with duplicate-delivery testing and consumer idempotency remaining operational requirements.

### Module and test changes

`OutboxModule` registers the critical worker queues and remains the shared provider for `OutboxService`. Reports and Privacy now import `OutboxModule`. New `OutboxService` tests verify durable event IDs, critical queue routing, worker payload shape, stable job IDs, repeating breach reminders, and retry bookkeeping. Admissions, fees, privacy, security, LMS, and payment tests were updated to assert transactional event creation rather than direct queue calls.

No new database migration is required for the V43.8 candidate because the changes reuse the existing `domain_events` table and existing worker queue schemas. The canonical pre-account DSR subject model, TeachingAssignment/workload model, universal RLS expansion, refund ledger, academic-calendar policy engine, and high-stakes examination engine remain deferred architecture or certification work.

### Validation evidence

Prisma generation, all 9 monorepo type-check tasks, 30 API suites with 419 tests, 5 utility/package suites with 36 tests, lint, production API/frontend builds, and deployment-artifact validation passed. Live PostgreSQL/RLS isolation, Redis crash and duplicate-delivery rehearsal, provider certification, browser E2E, backup/restore, load testing, cloud deployment, and institutional approval remain acceptance gates.


## V43.9 candidate — Certification hardening and production-risk closure (15 August 2026)

This wave responds to the independent V43.8 archive re-check. It preserves the V43.8 staging posture and focuses on source-verified production risks rather than adding broad modules.

### Financial concurrency

Fee-waiver approval now locks the `fee_waivers` row before reading its status and locks the associated `student_fees` row before recalculating the cap and applying the waiver amount. This closes the double-approval window in which two Bursars could both observe `PENDING` and apply the same amount. The focused suite verifies the dual-lock sequence and cap behavior.

SUPER_ADMIN cap enforcement now runs the advisory lock, active-count check, and final user/role write in one direct PostgreSQL transaction for both new user creation and new role grants. Existing-role updates do not consume an additional cap slot.

The six-hour payment reconciliation sweep retains its recoverable direct scheduling model but now uses deterministic `payment-reconcile:<paymentId>` job IDs, preventing overlapping sweeps from creating duplicate pending jobs while allowing a future retry after BullMQ retention removes a completed job.

### Privacy and security

Privacy erasure no longer selects or returns the subject’s old email. The response contains the DSR identifier and state metadata only. The canonical pre-account data-subject model and durable DSR receipt/failure workflow remain deferred because they require coordinated foreign-key, retention, and governance design.

Sensitive FORCE_RLS models now fail closed when a plain Prisma delegate is used while an authenticated ambient RLS transaction exists. The error is `RLS_CONTEXT_REQUIRED`; trusted workers, webhooks, and system jobs must use the explicit DirectPrismaService path. Comprehensive RLS cross-user execution and short-transaction performance migration remain certification gates.

Global Nest throttling now uses a Redis-backed Lua-atomic storage implementation shared across API replicas. Hit increments, expiry, and block decisions are one Redis operation. Redis failures propagate rather than silently reverting to process-local limits. New tests cover shared metadata, blocking, and failure behavior.

### Deployment configuration

The shared environment schema now rejects staging and production startup without `S3_REPORTS_BUCKET`, preventing report artifacts from failing only when the first report is generated. Development and test environments remain flexible for local/private artifact workflows.

No Prisma migration is required for the V43.9 candidate. The changes reuse existing fee, user/role, domain-event, and report-storage structures. The authoritative migration-baseline, fresh-install, upgrade, rollback, clinic re-encryption, backup/restore, load, cloud, provider, and institutional UAT gates remain open.

### Validation evidence

Prisma generation, all 9 monorepo type-check tasks, 32 API suites with 426 tests, 5 utility/package suites with 36 tests, lint, production builds, and deployment-artifact validation passed. The Next.js build retains the existing non-blocking middleware-to-proxy deprecation warning.


## V43.10 candidate — Automated certification-gate semantics and institutional UAT preparation (15 August 2026)

This follow-up wave does not add broad modules or claim production certification. It corrects the semantics of the automated certification runner and preserves an explicit boundary between source/automated validation and independent live-environment evidence.

### Certification runner semantics

`scripts/verify/production-certification.sh` is now described as an automated local/CI production-certification gate. Its eleven stages remain fail-closed for the commands they execute, but the final output now says `Automated production-certification gate passed` and explicitly states that independent runtime/provider evidence and institutional release approval are still required.

`scripts/verify/runtime-certification-evidence.sh` now reports that it verifies approved evidence artifacts marked `PASS`; it does not execute or independently certify the underlying RLS, backup/restore, DR/failover, performance, or UI/E2E drills. The provider script retains readiness-oriented behavior: it checks configured Paystack/Remita connectivity and requires operator-approved sandbox lifecycle evidence, but it does not invent provider-specific payment/RRR request shapes or claim webhook/reconciliation certification.

### Remaining gates

The release records keep real PostgreSQL RLS matrices, concurrent identity isolation, canonical Person/DataSubject identity, durable DSR workflow, governed PII inventory, provider lifecycle certification, refunds and ledger, academic applicant-to-alumni E2E, assessment/result traceability, published-result correction/versioning, migration baseline, clinic re-encryption, high-stakes examinations, browser E2E, backup/restore, DR, load, cloud, queue recovery, and institutional UAT as explicit gates.

No database migration is required for V43.10. The change is limited to certification scripts, wording, release documentation, and evidence posture.

### Validation evidence

Prisma generation, all 9 monorepo type-check tasks, 32 API suites with 426 tests, 5 utility/package suites with 36 tests, lint, production builds, deployment-artifact validation, shell syntax checks, and development skip paths for runtime/provider evidence passed. The release remains strong staging / pre-production ready, not production-certified.


## V43.11 candidate — Integrated runtime, academic, finance, and production certification (15 August 2026)

This wave deliberately avoids another generic feature rewrite. It converts the follow-up forensic findings into an executable certification matrix and corrects the release record where source plumbing is already fixed.

### Findings corrected

The API E2E and database integration test selectors are now recorded as closed findings: both suites exist and both Jest configurations use `passWithNoTests: false`. The API E2E suite is intentionally narrow and currently covers auth/security smoke behavior; the database integration suite covers restricted-role connection, selected FORCE RLS tables, no-identity leakage, and transaction-scoped identity. Full academic/finance/module E2E remains a live gate.

The k6 performance fixture seeder is also recorded as closed. It seeds synthetic non-production users/persons/students and explicitly refuses production use. Actual load evidence remains a separate execution requirement.

Published-result correction is downgraded from a missing implementation to a UAT/governance gate. The implementation records amendment metadata, immutable result versions, CGPA recomputation under a student lock, audit, and outbox behavior transactionally. The institution must still certify approval authority, evidence, and correction retrieval.

### Integrated certification matrix

`docs/CERTIFICATION_MATRIX_V43_11.md` defines execution and evidence requirements for real PostgreSQL RLS, canonical DSR/privacy, refunds, provider lifecycles, Nigerian admissions verification, academic lifecycle branches, assessment/result traceability, high-stakes examinations, browser journeys, backup/restore, DR, load, migration governance, queue recovery, clinic re-encryption, and reporting topology. It assigns owners, P1/P2 classification, evidence-file requirements, execution order, and exit criteria.

The matrix is a runbook and evidence contract; it is not a substitute for execution. The existing automated certification runner remains correctly described as an automated gate, not institutional production certification.

### Deployment posture

No database migration is introduced in V43.11. The release remains suitable for controlled staging and pre-production certification rehearsal. It is not production-certified until all P1 evidence is executed against real infrastructure, independently reviewed, and accepted through institutional release governance.

## V43.12 candidate — Targeted privacy, admissions, registration, and graduation hardening (15 August 2026)

### Database and migration changes

Migration `apps/api/prisma/migrations/0041_privacy_subject_identity_v43_12/migration.sql` adds nullable `DataSubjectRequest.subjectPersonId`, changes `subjectUserId` to nullable with `ON DELETE SET NULL`, adds the canonical Person relation, and extends `DsrRequestStatus` with identity-verification, partial-completion, legal-hold, and failure states. Apply the migration only through the project’s approved staging/production migration process after validating the historical baseline and backup/rollback plan. Prisma schema validation was performed with local placeholder `DATABASE_URL` and `MIGRATE_DATABASE_URL` values and does not represent a live database migration rehearsal.

### Privacy service changes

Privacy rectification, erasure, restriction, SAR, and portability flows now create the DSR before processing, resolve the canonical Person where available, and update the durable DSR after the operation. Erasure records `COMPLETED`, `LEGAL_HOLD`, or `FAILED`; the hard-delete path removes the User only after the durable DSR exists. Operators must review legal holds and partial-completion outcomes rather than treating every request as an unconditional hard delete.

### Admissions worker changes

Unavailable JAMB and WAEC/O’Level provider paths no longer complete successfully after logging a manual-verification message. They call `AdmissionsService.markManualVerificationRequired()` and emit `admissions.manual_verification_required` through the transactional outbox. The outbox router creates the corresponding durable admissions work item. Staging operators must verify queue routing, retry behavior, and the institution’s manual-review SLA with real provider credentials or approved fixtures.

### Academic registration and graduation changes

Course registration and course drop now share `assertRegistrationWindow()`, which fails closed when an active calendar or authoritative open/close pair is missing, honors event ranges, and handles multiple registration periods deterministically. Graduation now takes a student-specific PostgreSQL advisory transaction lock before reloading all eligibility and clearance inputs; all graduation effects remain atomic and alumni creation remains idempotent. A PostgreSQL-backed concurrency rehearsal is still required before production use.

### Validation evidence

The V43.12 candidate passed Prisma generation, 33 API suites with 432 tests, 5 utility/package suites with 36 tests, all 9 workspace type-check tasks, lint, API and web production builds, deployment-artifact validation, and Prisma schema validation with both required local placeholder URL variables. The Next.js middleware-to-proxy deprecation warning remains non-blocking and is unrelated to this release’s targeted repairs.

### Deployment posture

The archive is intended for controlled staging and pre-production deployment rehearsal. It remains subject to live PostgreSQL/RLS, provider, Redis/outbox, payment/refund, storage, backup/restore, DR, load, browser E2E, academic/finance lifecycle, migration-baseline, and institutional UAT gates. Do not label the release production-certified solely from the automated validation results.

## V43.13 follow-up candidate — Privacy hard-delete, Person intake, and calendar-integrity remediation (15 August 2026)

### Privacy erasure safety

The V43.12 follow-up exposed a remaining physical `User.delete()` branch that was inconsistent with the User model’s soft-delete contract and unsafe for institutional records retaining mandatory User references. V43.13 removes the branch. Every erasure pseudonymizes and deactivates the User, sets `deletedAt`, scrubs applicable linked PII and historical audit payloads, and retains the User row for referential integrity. Erasure audit metadata records `hardDeleteProhibited: true`, and the response reports `hardDeleted: false`.

### Canonical Person DSR intake

A DPO/SUPER_ADMIN-only `POST /privacy/person/:personId/intake` endpoint now creates a durable DSR for a canonical Person who may not yet have a User account. The request is marked `IDENTITY_VERIFICATION_REQUIRED`; `subjectPersonId` is always retained, `subjectUserId` is null for pre-account applicants, and a unique linked Student User is recorded when available. This is an intake and identity-workflow safeguard, not a claim that unverified pre-account erasure, export, rectification, or restriction has completed.

### Calendar configuration integrity

`CalendarService.addEvent()` now rejects reversed event ranges, registration close events before any opening, duplicate same-type events at the same start date, multiple closes within one opening period, and opening ranges extending beyond their close. The existing V43.12 runtime helper remains the fail-closed authority for registration and course drop operations.

### Validation evidence

The V43.13 candidate passed focused privacy/calendar suites, then the complete local gate: 33 API suites with 438 tests, 5 utility/package suites with 36 tests, all 9 workspace type-check tasks, lint, API and web production builds, deployment-artifact validation, Prisma schema validation with local placeholder `DATABASE_URL` and `MIGRATE_DATABASE_URL`, and source-level checks confirming no physical User-delete call remains. The extracted project has no Git metadata, so source-level hygiene checks replaced `git diff --check`. The expected outbox failure log emitted by a resilience test and the existing Next.js middleware-to-proxy deprecation warning are non-blocking.

### Deployment posture

The revised candidate is intended for controlled staging and pre-production rehearsal. Refund and ledger reversal, full verified Applicant → Person privacy processing, provider lifecycle certification, migration baseline, PostgreSQL/RLS, integrated E2E, browser E2E, backup/restore, DR, load, queue recovery, and institutional UAT remain mandatory production gates.

## V43.14 follow-up candidate — Academic-integrity and cross-module integration hardening (15 August 2026)

### Shared academic offering authorization

Added `AcademicOfferingAuthorizationService` under `apps/api/src/common/authorization`. The same policy is registered in LMS, Assessment, and Exams. STAFF actors require lecturer scope, or assigned invigilator scope for exam operations. HOD and DEAN actors require department/faculty ownership. Registrar and SUPER_ADMIN are explicit institutional overrides. Assessment writes and reads, exam timetable/candidate/attendance/report operations, and ordinary class attendance now pass through this policy.

### Exam attendance, marking, and result provenance

Exam attendance is now scoped to the timetable’s course offering and invigilator assignment. Added `POST /api/v1/exams/timetable/:id/marks`, which requires an eligible candidate, PRESENT/LATE attendance, an active EXAM component, offering authorization, and a score within the component maximum. Migration `0042_exam_mark_traceability_v43_14` adds nullable `AssessmentMark.examTimetableId` with a foreign key and index. Gradebook and StudentResult assessment evidence preserve the exam timetable source identifier.

### Assessment finalization

Added controlled AssessmentMark finalization for complete gradebooks. Finalized marks cannot be changed through ordinary entry. Draft result generation rejects incomplete or unfinalized marks, preventing ungoverned draft evidence from entering the result pipeline. Amendment, moderation, result approval, and Senate governance remain separate institutional controls.

### Durable progression refresh

Added the `academic-progression` BullMQ queue and `AcademicProgressionProcessor`. `ResultsService` now forwards the publication actor in `academic.progression.refresh_requested`; OutboxService routes the event to the academic queue using deterministic `academic-refresh:<studentId>:<semesterId>:<resultId>` job IDs, retries, and forwarded payloads. The processor invokes the existing advisory-lock-protected `AcademicService.runProgression()` method. Live Redis failure, retry, replay, and end-to-end result-to-progression evidence remain required.

### Student lifecycle safeguards

Student status updates now enforce an explicit transition matrix and require a reason. Reinstatement restores only ON_HOLD registrations attached to the current active academic period, preventing historical registrations from being resurrected after a later semester.

### Validation evidence

The V43.14 candidate passed 36 API suites with 453 tests, 5 utility/package suites with 36 tests, all 9 workspace type-check tasks, lint, API and web production builds, deployment-artifact validation, P1 academic-integrity validation with 11 invariants, P2 operational-contract validation with 9 invariants, Prisma generation, and Prisma schema validation using local placeholder `DATABASE_URL` and `MIGRATE_DATABASE_URL`. Focused academic-integrity tests passed 5 suites with 45 tests. Expected outbox resilience logs and the Next.js middleware-to-proxy deprecation warning are non-blocking.

### Deployment posture

V43.14 is intended for controlled staging and pre-production rehearsal. Refunds and ledger reversal, stronger external verification evidence, complete examination-board moderation, migration baseline and rollback, PostgreSQL/RLS, integrated E2E, browser E2E, backup/restore, DR, queue replay, load, privacy governance, and institutional UAT remain mandatory production gates.
