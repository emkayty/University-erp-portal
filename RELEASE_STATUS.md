# UniPortal ERP — Release Status

**Release line:** V43.14 candidate academic-integrity and cross-module integration hardening  
**Status:** Controlled staging / pre-production ready; not certified for live public admissions  
**Last reviewed:** 2026-08-15  
**Evidence:** `RECOMMENDATION_REVIEW_V43.md`, `DEPLOYMENT_CHANGELOG_V43.md`, and the current CI/local validation logs generated from this source tree.

> Static verification is strong, but live PostgreSQL/RLS, Redis, provider, payment, storage, cloud failover, backup restoration, and load certification still require execution in the target environment.

| Finding area | Status | Remediation or evidence | Residual risk / owner |
|---|---|---|---|
| Public admission type contract | Fixed in V43.1 | Server derives admission type from `admissionCycleId`; conflicting legacy values are rejected. | Admissions engineering; add API contract regression coverage. |
| International applicant contact | Fixed in V43.1 | Applicant and guardian DTOs accept Nigerian local or international `+countrycode` numbers; UI guidance updated. | Admissions/product; confirm country-aware E.164 policy in staging. |
| O’Level verification gate | Fixed in V43.1 | Automated eligibility and read-only checks use verified sittings only; staff verification endpoint added. | Registrar; verify against physical/provider evidence. |
| Manual JAMB verification | Fixed in V43.1 | Staff endpoint records verified status, score, reviewer audit, and supports provider-unavailable operation. | Admissions/JAMB owner; pilot with institutional procedures. |
| Configured O’Level policy | Fixed in V43 | Distinct combined-sitting credits, configured thresholds, alternatives, documents, and bulk-screening consistency are tested. | Registrar; extend admission-type-specific policies. |
| Privacy export identity linkage | Fixed in V43.1 | Applicant export resolves through Student → User rather than comparing Person and User IDs; linked applicant graph is included. | Privacy/DPO; standalone pre-user applicants need an applicant-subject DSR schema extension. |
| Privacy erasure graph | Improved in V43.1 | User, Student, Applicant, Person, addresses, contacts, education, documents, O’Level identifiers, and admission identifiers are pseudonymized where retention requires it. | Privacy/DPO; execute live retention and legal-hold review. |
| Examination reference data | Fixed in V43.1 | NBAIS Tahfeez and distinct NABTEB NTC, NBC, ANTC, and ANBC types are deterministic seed data. | Registrar; validate against the institution’s current catalog. |
| CI pgvector parity | Fixed in V43.1 | Integration service uses `pgvector/pgvector:pg16`. | CI owner; run GitHub-hosted integration job. |
| AWS CodeDeploy artifact | Fixed in V43.1 | Revision packages workspace manifests, compiled API, Prisma schema, shared packages, scripts, PM2 config, and installs dependencies before schema deployment. | Cloud owner; execute in staging AWS account. |
| AWS Next.js public topology | Open / architecture decision | Current Terraform models S3 static default plus ALB API, while the web app is Next.js standalone. | Cloud owner must choose ALB/ECS/Next.js origin or deliberately convert to static export. |
| Prisma production migrations | Open / documented limitation | Controlled `db push` plus hardening is used because the historical migration chain is not a fresh baseline. V43.5 adds forward migrations 0036–0039. | Database owner must create and validate a consolidated baseline before switching to `migrate deploy`. |
| CAPS lifecycle | Source-level gate fixed; live certification open | Applicant now stores separate CAPS status/reference/programme/institution/timestamps, and UTME/DE/TRANSFER matriculation requires `CANDIDATE_ACCEPTED`. | Admissions/regulatory owner must connect and certify the real CAPS provider workflow before UTME production. |
| Provider integrations | Open certification gate | JAMB/WAEC/payment/SMTP/object-storage modes require real credentials and sandbox or pilot execution. | Integration owners. |
| Course-offering capacity concurrency | Fixed in V43.6 source; live certification open | Registration now acquires deterministic offering-scoped advisory locks before capacity counts, while retaining the student lock for credit-unit races. Historical `COMPLETED` registrations no longer consume seats; `REGISTERED` and `ON_HOLD` do. | Platform/DBA/SRE; execute PostgreSQL concurrency and load rehearsal. |
| Admission-clearance policy governance | Fixed in V43.6 source | Changing `requireAdmissionClearance` now requires a distinct active VC or Registrar approval reference, reason, effective date, and audit metadata. | Governance/Registrar; validate institutional delegation and approval retention. |
| LMS staff offering-scope authorization | Fixed in V43.7 source | Staff-facing LMS operations verify lecturer, HOD, dean, registrar, or super-admin scope against the target CourseOffering before reading or mutating staff-facing LMS data. | Platform/DBA/SRE; execute live RLS and role-isolation certification. |
| Scheduled admission-clearance policy activation | Fixed in V43.7 source | Future approved changes are stored as pending policy fields with an effective timestamp and governance document reference; matriculation uses the pending value only once due. | Governance/Registrar; validate clock, approval retention, and operational change-control procedures. |
| LMS completed-registration permissions | Fixed in V43.8 candidate source | Completed registrations retain read access for historical learning content but cannot submit assignments, start quiz attempts, update progress, or participate in discussions. | Academic governance; confirm institutional post-completion access policy. |
| Critical asynchronous producer reliability | Improved in V43.8 candidate source | Admissions JAMB, invoice generation, Remita reconciliation, reports, privacy exports, and security reminders now write durable domain events and use routed outbox dispatch with stable job IDs. | Platform/SRE; run live Redis/PostgreSQL crash, duplicate-delivery, and worker-recovery certification. |
| Fee-waiver approval concurrency | Fixed in V43.9 candidate source | Approval now locks the waiver row before status evaluation and locks the student fee before cap calculation and financial application. | Finance/DBA; execute live concurrent approval and cap-load rehearsal. |
| Privacy erasure response disclosure | Fixed in V43.9 candidate source | Erasure no longer returns the subject's former email address. | Privacy/DPO; verify response minimization and legal-hold behavior in UAT. |
| Sensitive RLS bypass behavior | Fixed in V43.9 candidate source | FORCE_RLS model access through the plain client during an ambient request now throws `RLS_CONTEXT_REQUIRED`; trusted system operations remain explicit. | Platform/DBA; complete cross-user RLS matrix and background-job certification. |
| SUPER_ADMIN cap transaction race | Fixed in V43.9 candidate source | Advisory-lock cap count and SUPER_ADMIN create/grant writes now share one direct transaction. | Security/DBA; execute concurrent role-grant rehearsal. |
| Payment reconciliation sweep duplicate jobs | Fixed in V43.9 candidate source | Six-hour sweep assigns deterministic `payment-reconcile:<paymentId>` job IDs. | Finance/SRE; certify worker retention and retry behavior. |
| Distributed rate limiting | Fixed in V43.9 candidate source | Global throttling uses Lua-atomic Redis storage shared across API replicas. | Security/SRE; execute multi-replica and Redis-failure tests. |
| Report artifact storage startup validation | Fixed in V43.9 candidate source | Staging and production startup validation requires `S3_REPORTS_BUCKET`; local development/test remain flexible. | Platform/SRE; validate approved object-storage endpoint and credentials. |
| Automated certification-gate semantics | Fixed in V43.10 candidate scripts | Production certification runner and runtime-evidence output now distinguish automated gate passage from independent runtime/provider evidence and institutional production approval. | Release/Platform; attach approved live evidence before any production sign-off. |
| API E2E and integration test discovery | Closed in V43.10 source | Non-empty E2E and database integration suites exist, and both Jest configurations use `passWithNoTests: false`; coverage remains narrow and is tracked separately as a production gate. | QA/Platform; execute the integrated journey matrix. |
| k6 performance fixture seeder | Closed in V43.10 source | `scripts/k6/seed-test-students.ts` seeds staging/test/development fixtures and refuses production; runtime performance evidence remains open. | SRE/Performance; execute approved workload profiles. |
| Published-result amendment implementation | Downgraded to UAT gate | Result amendment, version history, CGPA recomputation, audit, and outbox are implemented transactionally; governance and live UAT remain required. | Registrar/Exam Board; approve amendment authority and evidence. |
| Integrated certification matrix | Added in V43.11 candidate | `docs/CERTIFICATION_MATRIX_V43_11.md` defines P1/P2 execution, evidence, owners, and exit criteria without claiming that source tests are live certification. | Release/Institution; execute and sign each P1 gate. |
| RLS, concurrency, backup/restore, and load | Open certification gate | Source-level capacity race hardening is present, but dynamic PostgreSQL/RLS, load, backup, and restore execution is not represented by the source archive. | Platform/DBA/SRE owners. |
| DSR subject identity and durable erasure | Fixed in V43.12/V43.13 candidate source | DSR links canonical Person when available, permits subjectUserId to be nulled on account deletion, records explicit partial/legal-hold/failure states, and creates the request before processing. V43.13 removes the remaining physical User-delete branch; all erasure now pseudonymizes/deactivates the User. | DPO/Legal/DBA; execute pre-account, legal-hold, export, failure, and deletion rehearsal. |
| Unavailable admissions provider jobs | Fixed in V43.12 candidate source | JAMB/WAEC worker paths now persist REVIEW_REQUIRED/manual-verification work and emit a durable outbox event instead of silently completing a provider stub. | Admissions/Registrar; certify real provider or approved manual fallback. |
| Registration-window authority | Fixed in V43.12 candidate source | Registration and drop-course share a fail-closed calendar helper that requires an authoritative open/close pair, honors event ranges, and supports multiple periods deterministically. | Academic Registrar; certify calendar policy and late-registration variants. |
| Graduation concurrency | Fixed in V43.12 candidate source | Graduation takes a student advisory transaction lock before reloading candidate/status and rechecking eligibility, then commits history, alumni, candidate, audit, and outbox effects atomically. | Registrar/DBA; execute concurrent graduation rehearsal. |
| Physical User hard-delete loophole | Fixed in V43.13 candidate source | Privacy erasure no longer calls `User.delete`; every User is pseudonymized/deactivated and retained for referential integrity, audit, notification, incident, and DSR history. | DPO/DBA; execute live retention and legal-hold rehearsal. |
| Pre-account Person privacy intake | Improved in V43.13 candidate source; processing gate remains | DPO/SUPER_ADMIN can create a Person-linked DSR with `IDENTITY_VERIFICATION_REQUIRED`; pre-account requests retain `subjectUserId = NULL`, while a unique Student link is recorded when available. | DPO/Admissions; implement and certify verified Applicant → Person processing. |
| Registration calendar configuration integrity | Improved in V43.13 candidate source | Calendar writes reject reversed ranges, close-before-open, duplicate same-type events, ambiguous closes, and open ranges extending beyond close. | Academic Registrar; certify multi-period, suspension, and late-registration policies. |
| Academic offering authorization | Fixed in V43.14 candidate source | Shared `AcademicOfferingAuthorizationService` now guards Assessment, Exams, and LMS operations. STAFF requires lecturer or assigned invigilator scope; HOD and DEAN require department/faculty ownership; Registrar and SUPER_ADMIN are explicit overrides. | Registrar/QA; execute live role-isolation and RLS certification. |
| Exam attendance and mark provenance | Fixed in V43.14 candidate source; live certification open | Exam attendance and exam-mark entry are offering/timetable scoped. Exam marks require eligible candidates and PRESENT/LATE attendance, target an EXAM component, and persist `examTimetableId` provenance into AssessmentMark and result evidence through migration 0042. | Exams/Registrar; certify invigilator assignment, moderation, and result-board workflow. |
| AssessmentMark finalization | Fixed in V43.14 candidate source | HOD/DEAN/REGISTRAR/SUPER_ADMIN can finalize complete marks; finalized marks cannot be edited through ordinary entry; draft result generation rejects incomplete or unfinalized marks. | Exam Board; implement and certify amendment/moderation/approval authority. |
| Academic progression refresh consumer | Fixed in V43.14 candidate source; live worker certification open | Result publication now forwards the publishing actor and routes `academic.progression.refresh_requested` to a durable academic queue with deterministic job IDs and retrying `AcademicProgressionProcessor`. | Platform/Academic; execute Redis failure, replay, and end-to-end result-to-progression rehearsal. |
| Student status transition and reinstatement policy | Improved in V43.14 candidate source | Status changes use an explicit transition matrix and require a reason; reinstatement restores only ON_HOLD registrations in the current active academic period, preventing stale historical resurrection. | Registrar; approve institutional readmission policy and UAT edge cases. |
| Pact coverage | Partially fixed | Provider discovery is repaired; behavioural coverage remains intentionally minimal and must not be advertised as full API coverage. | QA/API owners. |
| Historical evaluation reports | Superseded | Historical reports are retained for traceability and explicitly marked superseded where applicable. | Release manager; update this register for every release. |

## Release decision

This release may proceed to **controlled staging remediation and deployment rehearsals**. It must not be labelled **Production Ready / Certified for Institutional Use** until the open certification gates are executed and signed by the responsible owners.


## Third forensic review update

The third attachment identified a genuine alumni authorization defect, AWS ALB and health-probe inconsistencies, an EC2 CodeDeploy IAM mismatch, a false canary claim, an application-number allocation race, non-atomic idempotency replay behavior, O’Level sitting metadata inconsistency, duplicate exam-type semantics, selective rather than comprehensive RLS, applicant DSR identity limitations, and plaintext clinic health attributes.

The following items are now remediated in source:

| Area | Current status | Evidence |
|---|---|---|
| Alumni profile authorization | Fixed | Owner-only updates, VC/SUPER_ADMIN administrative override, private-profile access control, and public-response minimization are implemented and covered by dedicated tests. |
| Audit and clinic route ordering | Fixed | Literal `summary` and `patients/me` routes are registered before same-shape parameterized routes. Other attachment-reported route claims were not true ordering defects in the current tree because literals already preceded parameters. |
| AWS ALB/API topology | Fixed for API target | ALB target groups, security groups, health checks, and smoke tests now use API port 3001 and `/api/health/live`. Next.js public-origin architecture remains a separate explicit decision. |
| AWS health probe | Fixed | Liveness is public and minimal; readiness is public for infrastructure checks; detailed health and integration diagnostics remain privileged. |
| AWS CodeDeploy IAM | Fixed | EC2/Server CodeDeploy uses the service-role `AWSCodeDeployRole` policy instead of the ECS-specific policy. |
| Canary documentation | Corrected | The unsupported 10%-for-5-minutes claim was removed; the deployment is documented as blue/green `OneAtATime` until a staged traffic strategy is actually implemented. |
| Application-number race | Fixed in application flow | Prefix allocation and applicant/application insertion now occur in the same transaction under the same advisory lock. |
| Idempotency replay | Improved | P2002 races with an idempotency key now perform bounded replay lookup and return the committed result when available. |
| O’Level sitting metadata | Fixed | Rows in one sitting must agree on authority, type, category, year, and exam classification before persistence. Controlled reference records derive the canonical exam type and contradictory client values are rejected. |
| Clinic sensitive attributes | Improved | Genotype, allergies, and chronic conditions are encrypted before storage; authorized profile reads decrypt them; broad patient lists and appointment summaries no longer expose allergies. Legacy plaintext rows remain readable for migration and must be re-encrypted during operational rollout. |

The following remain open by design: a consolidated immutable Prisma migration baseline, comprehensive RLS across every sensitive domain, canonical applicant/person DSR subjects for applicants who do not yet have a User, the AWS Next.js public-origin decision, live provider integrations, refunds, CAPS, backup/restore, concurrency, load, and institutional certification.

The overall release remains **controlled staging / pre-production ready**, not certified for live public admissions.


## Fourth forensic review update

The fourth attachment was based on an older V43.1 state. Its claims about alumni authorization, audit route ordering, AWS port and health checks, CodeDeploy IAM, smoke tests, application-number atomicity, idempotent replay, O’Level consistency, clinic encryption, and CI readiness are now closed in V43.2 and were verified against the current tree.

A new confirmed defect was found in the current source: the exam timetable bulk attendance route was registered after the per-student attendance route. It is now ordered first. Disaster-recovery health validation also used stale `/api/health`; the workflow and queue-health script now use public `/api/health/ready` without placing administrator credentials in automation.

The release remains **controlled staging / pre-production ready**. Open gates remain the consolidated Prisma migration baseline, comprehensive RLS certification, canonical Applicant/Person DSR subjects for pre-account applicants, AWS Next.js public-origin selection, live Remita/JAMB/CAPS/payment certification, full refund workflow, legacy clinic plaintext re-encryption, backup/restore and load rehearsals, and retirement of the legacy SSH deployment path after CodeDeploy staging proof.


## Sixth forensic review update — V43.5

The sixth attachment independently re-checked the V43.4 archive and confirmed that most academic-integrity findings are fixed. The following additional source-level repairs are now included in V43.5:

| Area | Current status | Evidence |
|---|---|---|
| Mandatory admission clearance | Fixed as an explicit policy | `InstitutionSettings.requireAdmissionClearance` defaults to true; matriculation requires `CLEARANCE` by default. Institutions with a documented exception can set the policy false, in which case `ACCEPTED` remains permitted. |
| Semester fee-clearance ambiguity | Fixed as explicit policy | `FeeClearancePolicy` supports `SEMESTER_REQUIRED`, `ANNUAL_CLEARANCE`, and `NO_FINANCIAL_GATE`; the former implicit missing-invoice fallback is no longer the production default. |
| Quiz max attempts | Fixed | Quiz attempts use the configured `CourseContent.maxAttempts` under an advisory lock rather than a hidden limit of three. |
| Quiz availability and deadline | Fixed | Quiz start and submission enforce availability end, due date, and `allowLateSubmissions`; `QuizAttempt.submittedLate` is persisted. |
| Exam absence semantics | Fixed defensively | ABSENT/NO_SHOW results now use an effective score of zero and canonical `ABS` grade/zero grade point while preserving the raw source score in evidence. |
| CourseOffering audience | Improved | Offerings can be scoped to a `CurriculumVersion`; registration rejects an offering scoped to another curriculum while nullable audience keeps shared offerings possible. |
| Privacy export failure handling | Improved | Missing subjects and unsupported custom report kinds now fail the report job instead of producing a successful empty export. DSR status is synchronized to COMPLETED or REJECTED by the worker. |

The following sixth-review conclusions remain open certification or architecture gates: live JAMB/WAEC/identity/O-Level provider verification, comprehensive RLS hard enforcement, full programme-transfer and progression E2E evidence, browser-level E2E coverage, PostgreSQL/RLS integration matrices, remaining direct queue-to-worker paths, report worker/data-layer scope certification, finance adversarial concurrency testing, backup/restore rehearsal, load testing, and institutional production sign-off. The proposed OfferingAudience/TeachingAssignment/workflow-engine expansion remains a future architecture recommendation rather than a reason to destabilize the current release.

V43.5 validation passed with 9 monorepo type-check tasks, 29 API suites and 412 API tests, lint, production API/frontend builds, Prisma generation, and deployment-artifact validation. The release remains controlled staging / pre-production ready, not unrestricted production-certified.


## Seventh forensic review update — V43.6 final hardening

The seventh attachment directly inspected the V43.5 source and confirmed that the V43.5 academic repairs are genuine. It identified one material remaining source defect and several governance or certification concerns.

| Area | V43.6 status | Evidence or residual gate |
|---|---|---|
| Course-offering capacity race | Fixed in source | Registration retains the per-student advisory lock and now acquires all offering-capacity locks in sorted offering-ID order before counting seats and inserting registrations. The capacity count includes `REGISTERED` and `ON_HOLD`, and excludes historical `COMPLETED`. | Run live PostgreSQL multi-connection and load tests before opening high-volume registration. |
| Admission-clearance policy governance | Fixed in source | A change to `requireAdmissionClearance` requires a distinct active VC or Registrar approver, reason, effective timestamp, and audit metadata. | Confirm delegation, approval retention, and institutional change-control procedure. |
| LMS deadline invariant | Fixed in source | Content creation rejects invalid timestamps, start-after-end, due-before-start, and due-after-availability-end configurations. `availabilityEnd` is documented and enforced as the absolute hard cutoff. | Validate policy with academic administrators. |
| Offering audience model | Interim source fix retained | Nullable single `curriculumVersionId` remains a safe interim constraint. A multi-audience `OfferingAudience` model is deferred architecture work. | Add only when multi-programme shared offerings require it. |
| Exam absence policy | Safe baseline retained | ABSENT/NO_SHOW produces canonical ABS/zero grade-point semantics while raw evidence remains. Excused, medical, and approved-exception policies remain institution-specific future configuration. | Registrar/Senate must approve absence semantics before production. |

The following remain genuine production or certification gates: live JAMB/CAPS and WAEC/O’Level provider execution; Remita and Paystack merchant certification; payment reconciliation provider calls; SMTP/SMS/object-storage validation; PostgreSQL/RLS role-isolation matrix; remaining direct queue/outbox conversions; programme-transfer lifecycle E2E; complete browser academic and finance E2E; backup/restore rehearsal; load and concurrency testing; cloud deployment rehearsal; and institutional sign-off. Pre-account applicant DSR subject modeling, annual financial-clearance authority, TeachingAssignment/workload, central workflow, accreditation/QA, SIWES/practicum, and outcome/competency mapping remain planned maturity work.

V43.6 validation passed with Prisma generation, 9 monorepo type-check tasks, 29 API suites with 415 API tests, lint, production API/frontend builds, and deployment-artifact validation. The release remains controlled staging / pre-production ready, not unrestricted production-certified.

## Eighth forensic review update — V43.7

The eighth attachment re-checked the V43.6 source and identified two material targeted gaps. First, several staff-facing LMS operations accepted a course-offering identifier without enforcing that a lecturer, HOD, dean, registrar, or super-admin was authorized for that offering. Second, a future approved admission-clearance policy could be recorded with an effective date while matriculation continued to read only the current policy.

Both findings are fixed in source. `LmsService.assertStaffOfferingScope()` now resolves the target offering through its lecturer, department HOD, and faculty dean relations and permits only the responsible actor or institution-wide registrar/super-admin roles. The guard is applied across content, announcement, quiz-question, submission-marking, quiz-attempt-marking, attachment, and discussion staff operations. The admission-clearance settings flow now stores future approved changes in `pendingAdmissionClearance`, `pendingAdmissionClearanceEffectiveAt`, and `pendingAdmissionClearanceApprovalRef`; matriculation selects the pending value only when its effective timestamp is due. Migration `0040_scheduled_admission_clearance_policy_v43_7` adds the fields. The settings DTO distinguishes the approver user identifier from the governance document reference.

V43.7 validation passed Prisma generation, all 9 monorepo type-check tasks, the focused LMS and StudentsService suite with 49 tests, the complete serial monorepo test run, lint, production API/frontend builds, and deployment-artifact validation. The release remains controlled staging / pre-production ready. Selective RLS, durable outbox conversion, canonical pre-account DSR subjects, live provider certification, refunds, finance adversarial scope, legacy clinic plaintext re-encryption, migration-baseline replacement, institutional absence-policy variants, multi-audience offerings, TeachingAssignment/workload, and a central workflow engine remain explicit residual gates or planned architecture work.


## Follow-up forensic review update — V43.8 candidate

The follow-up attachment confirmed that the V43.7 LMS offering-scope and admission-clearance effective-date fixes are genuine. It identified a remaining LMS business-rule ambiguity and a systemic reliability gap: completed registrations were treated as active for every LMS action, and several critical workflows still performed direct database-to-BullMQ enqueueing after their business transaction.

The LMS gate is now action-aware. Completed registrations remain eligible to view learning content and historical offerings, but are read-only for assignment and quiz submissions, quiz attempts, progress updates, and discussion participation. New adversarial tests cover lecturer, HOD, dean, registrar, and super-admin scope decisions through a public staff operation, as well as completed-registration write denial.

The critical asynchronous producer gap is improved in source. Admissions JAMB verification, fee invoice generation, Remita reconciliation, general reports, privacy SAR and portability exports, and security reminder scheduling now record domain events transactionally and are routed by the shared outbox dispatcher to their existing worker queues. Routed jobs preserve worker payload contracts and use deterministic event or incident job IDs. PostgreSQL and Redis remain independent systems; the implementation explicitly documents at-least-once delivery, stable job deduplication where queue retention permits it, and the need for idempotent consumers.

V43.8 candidate validation passed Prisma generation, all 9 monorepo type-check tasks, 30 API suites with 419 API tests, 5 utility/package suites with 36 tests, lint, production API/frontend builds, and deployment-artifact validation. The release remains controlled staging / pre-production ready. TeachingAssignment, canonical pre-account DSR subjects, comprehensive RLS, universal consumer idempotency ledgers, academic-calendar enforcement, high-stakes examination controls, assessment-to-result evidence certification, published-result amendment E2E, refunds, external providers, backup/restore, load, cloud, and institutional sign-off remain residual gates or planned architecture.


## Follow-up forensic review update — V43.9 candidate

The follow-up source audit independently confirmed the V43.8 improvements and corrected several stale open findings: response envelopes, Redis health checks, stable invoice idempotency, fee User/Student identity handling, safe internal redirects, report authorization, and the V43.8 direct producer queue conversions are not open defects in the current source.

V43.9 closes the verified fee-waiver approval race by locking the waiver row before status evaluation and the student-fee row before cap calculation/application. It removes the old email from privacy erasure responses, makes sensitive FORCE_RLS model bypasses fail closed during authenticated requests, moves SUPER_ADMIN cap checks into the same direct transaction as create/grant writes, assigns deterministic payment-specific IDs in the reconciliation sweep, wires a Lua-atomic Redis-backed throttler for shared replica limits, and requires `S3_REPORTS_BUCKET` during staging/production environment validation.

The full gate passed Prisma generation, all 9 monorepo type-check tasks, 32 API suites with 426 tests, 5 utility/package suites with 36 tests, lint, production API/frontend builds, and deployment-artifact validation. V43.9 remains controlled staging / pre-production ready, not production-certified. Canonical pre-account DSR subjects, durable DSR workflow semantics, governed PII inventory, comprehensive RLS matrix, short RLS transaction migration, provider integrations, refunds, academic lifecycle E2E, assessment/result certification, published-result amendments, migration baseline, clinic re-encryption, high-stakes examinations, backup/restore, load, cloud, browser E2E, and institutional UAT remain residual gates.


## Follow-up forensic review update — V43.10 candidate

The V43.9 follow-up independently confirmed the previous source hardening and narrowed the remaining issue to certification evidence semantics plus genuine live-environment and institutional gates. The automated production-certification runner previously ended with wording that could be read as completed production certification even though runtime and provider stages verify approved evidence artifacts and readiness prerequisites rather than executing every underlying drill.

V43.10 changes the runner to say **Automated production-certification gate passed** and explicitly requires independent provider/runtime evidence and institutional release approval. The runtime evidence script now states that it verifies approved artifacts marked PASS and does not execute or independently certify the underlying drills. Provider readiness language remains intentionally limited to credential/connectivity and operator-approved sandbox evidence; it is not represented as payment lifecycle certification.

V43.10 validation passed Prisma generation, all 9 monorepo type-check tasks, 32 API suites with 426 tests, 5 utility/package suites with 36 tests, lint, production API/frontend/shared builds, deployment-artifact validation, shell syntax checks, and development skip-path checks for runtime/provider evidence scripts. The release remains strong staging / pre-production ready, not production-certified.


## Follow-up forensic review update — V43.11 candidate

The follow-up independently confirmed that API E2E and database integration test discovery are fixed: non-empty suites exist and both Jest configurations enforce `passWithNoTests: false`. It also confirmed that the k6 performance fixture seeder exists and refuses production use. Those source-plumbing findings are closed, but actual academic/finance/module E2E and performance evidence remain open.

The review further downgraded published-result correction from a missing implementation to an institutional/UAT gate. Result amendment, ResultVersion history, CGPA recomputation, audit, and outbox behavior are implemented transactionally; the remaining requirement is policy-authorized approval and live evidence.

V43.11 adds `docs/CERTIFICATION_MATRIX_V43_11.md`, which defines the P1/P2 execution matrix, evidence contract, responsible owners, execution order, and release exit criteria. The matrix is a runbook, not evidence. V43.11 remains controlled staging / pre-production ready and is not certified for live university operations until the P1 runtime, provider, academic, finance, privacy, infrastructure, and institutional UAT artifacts are executed and approved.


## Follow-up forensic review update — V43.12 candidate

The review identified four genuine source defects above the existing certification checklist and they were repaired without a broad rewrite. DSR processing now creates a durable record before destructive action, supports canonical Person linkage and nullable legacy User references, and records explicit failure/legal-hold states. Unavailable JAMB/WAEC operations now produce an explicit manual-verification-required state and durable admissions work event. Registration and drop-course share a fail-closed, range-aware calendar helper. Graduation acquires a student-level advisory lock before rechecking candidate approval, student status, academic eligibility, degree audit, and administrative clearance; downstream graduation effects remain atomic and alumni creation is idempotent.

Migration `0041_privacy_subject_identity_v43_12` is included. V43.12 automated validation passed 33 API suites/432 tests, 5 utility/package suites/36 tests, 9 type-check tasks, lint, builds, deployment-artifact validation, and Prisma schema validation with local placeholder URL variables. The raw schema-validation attempt without those variables failed at configuration parsing only and was rerun successfully with both required variables defined.

V43.12 remains controlled staging / pre-production ready. Refund domain, complete provider lifecycles, Library/Hostel clearance integration, full Person/DataSubject coverage for pre-account Applicants, real PostgreSQL/RLS matrix, academic/finance E2E, browser journeys, backup/restore, DR, load, queue recovery, migration rehearsal, and institutional UAT remain release gates.


## V43.13 follow-up forensic review update

The new review independently verified the V43.12 source and confirmed the four targeted V43.12 repairs. It identified one genuine additional P1 privacy defect: physical User deletion remained reachable for accounts without the narrow set of legal-hold indicators. V43.13 removes that branch entirely. Privacy erasure now always pseudonymizes and deactivates the User, preserves the durable identity anchor, scrubs historical audit payloads, and records `hardDeleteProhibited` in the erasure audit metadata.

V43.13 also adds a DPO/SUPER_ADMIN-only canonical Person DSR intake route. It creates a Person-linked DSR for pre-account applicants with `IDENTITY_VERIFICATION_REQUIRED`, keeps `subjectUserId` null when no account exists, and records a unique linked Student User when available. This is a durable intake and identity-workflow repair; it does not claim that unverified pre-account erasure or portability has completed.

Calendar event writes now reject malformed registration ranges and ambiguous duplicate/close configurations. Focused privacy and calendar tests pass, and the complete local validation passes with 33 API suites/438 tests, 5 utility/package suites/36 tests, 9 type-check tasks, lint, production builds, deployment-artifact validation, and Prisma schema validation using local placeholder URL variables.

The revised candidate remains controlled staging / pre-production ready. Refunds and ledger reversal, complete verified Applicant → Person privacy processing, provider lifecycles, migration baseline, PostgreSQL/RLS, integrated E2E, backup/restore, DR, load, queue recovery, and institutional UAT remain open certification gates.


## V43.14 follow-up forensic review update

The supplied follow-up review was checked against the revised V43.13 source. It independently confirmed the V43.12/V43.13 privacy, admissions-provider, registration-window, graduation, hard-delete, Person-intake, and calendar-integrity closures. It also confirmed the remaining finance, provider, migration, RLS, E2E, backup/restore, DR, load, privacy-governance, and institutional-UAT gates.

The following additional academic-integrity findings were valid and are repaired in the V43.14 candidate: Assessment and Exams lacked offering/timetable-level actor authorization; exam attendance lacked invigilator scope; exam marks had no traceable path into AssessmentMark; draft/unfinalized assessment marks could feed draft result generation; `academic.progression.refresh_requested` had no academic consumer; and reinstatement could resurrect historical ON_HOLD registrations without a formal status transition matrix.

V43.14 introduces the shared `AcademicOfferingAuthorizationService`, migration 0042 for nullable `AssessmentMark.examTimetableId`, attendance-gated exam-mark entry, immutable provenance in result evidence, controlled AssessmentMark finalization, a durable academic progression queue/processor, and explicit student-status transition/reinstatement rules. The existing LMS scope policy now uses the same shared authorization implementation.

The final local validation gate passed: 36 API suites / 453 tests, 5 utility/package suites / 36 tests, 9 workspace type-check tasks, lint, API and web production builds, deployment-artifact validation, P1 academic-integrity static validation, P2 operational-contract static validation, Prisma generation, and Prisma schema validation with local placeholder URL variables. The expected Redis/outbox resilience logs and Next.js middleware-to-proxy deprecation warning are non-blocking.

The release remains **controlled staging / pre-production ready**, not production-certified. Live exam-board moderation, provider evidence, progression worker replay, PostgreSQL/RLS, finance refunds, migration baseline, E2E lifecycle, backup/restore, DR, load, and institutional UAT remain mandatory gates.
