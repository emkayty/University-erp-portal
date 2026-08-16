# V43 Attached Recommendation Review and Remediation Record

**Review date:** 15 August 2026

**Scope:** Attached forensic evaluation compared with the current UniPortal working tree after deployment preparation.

## Executive conclusion

The attachment contains several valid findings, several findings that were already repaired in V43, and a few conclusions that were caused by inspecting a different extraction path or an older artifact state. The current project should be classified as a **controlled staging / pre-production release**, not as unrestricted production-certified software. The remaining production gates are primarily live PostgreSQL/RLS, Redis/worker, browser, external provider, backup/restore, and institutional operational certification rather than a lack of domain breadth.

## Finding comparison

| Attached finding | Current assessment | Action |
|---|---|---|
| Public application idempotency key is sent in the JSON body instead of `X-Idempotency-Key` | **Not confirmed in the current tree.** `apps/web/app/apply/page.tsx` passes `{ idempotencyKey: ... }` as the third options argument to `apiClient.post`; `apps/web/lib/api-client.ts` converts that option to the `X-Idempotency-Key` header. | No change required. Added this conclusion to the review record. |
| Configured O’Level credit/sitting/language policy is ignored | **Confirmed.** The evaluator used hardcoded five credits, English, Mathematics, and two sittings. | Implemented policy-driven evaluation using `AdmissionRequirement`. |
| Duplicate subjects across combined sittings can inflate credit count | **Confirmed.** The old evaluator counted rows instead of distinct credited subjects. | Implemented distinct normalized-subject counting across all sittings. |
| Programme-specific O’Level requirements are not authoritative | **Confirmed.** The schema and DTO existed, but evaluator behavior was incomplete. | Implemented required subjects and alternatives, plus policy snapshots. |
| Bulk dry-run screening writes screening records | **Confirmed.** Bulk screening called the side-effecting evaluator before checking `dryRun`. | Dry runs now call the evaluator with `persistScreening: false`. |
| Bulk screening bypasses the normal status/state machine | **Confirmed.** It directly updated applicants and skipped application synchronization, decisions, offers, outbox semantics, and the canonical audit path. | Real bulk outcomes now use `updateStatus()` and retain the bulk summary audit. |
| JAMB/WAEC automation is not production-certified | **Confirmed as an operational certification boundary, not a new code defect.** The health endpoint already exposes provider-configured versus manual-verification modes. | Preserved the manual fallback and documented provider certification as a release gate. No provider credentials or contracts were invented. |
| Paystack/Remita are not live-certified | **Confirmed as an external certification requirement.** Source-level webhook/reconciliation controls exist, but live merchant/provider evidence is still required. | Retained explicit status-verification configuration and documented sandbox/live certification requirements. |
| Repository-wide audit scripts report false zeros outside `/home/ubuntu/deep_audit` | **Confirmed.** `cross_layer_audit.py` and `scan_architecture.py` used a hardcoded root. | Both now derive the root from `Path(__file__).resolve().parent` and accept an optional explicit root. They now report 339 backend routes and 216 frontend API calls when executed from `/tmp`. Query-string normalization was also added to reduce false unmatched results. |
| Pact provider filename/path does not match consumer output | **Confirmed.** Provider verification referenced `uniportal.web-uniportal.api.json` while the consumer output is `@uniportal/web-@uniportal/api.json`. | Provider verification now discovers all JSON pacts in the shared directory. The Pact consumer test passes. Live provider verification still requires PostgreSQL and a running API. |
| Pact coverage is only a single interaction | **Confirmed as coverage scope.** The current consumer suite contains a worked login interaction, not complete endpoint coverage. | No artificial interactions were added. The limitation is documented as a coverage backlog rather than falsely certified. |
| Existing tests prove full production runtime certification | **Rejected as an overclaim.** Unit/build/static tests are valuable evidence but do not prove live RLS isolation, provider behavior, browser deployment, backups, or restoration. | Current deployment and release documents explicitly separate source validation from live certification. |
| Reference-data seed can download Nigerian LGAs | **Confirmed.** The seed contained a network fallback when the bundled snapshot was absent. | Production/reference seeding now fails closed if the versioned snapshot is missing and never downloads mutable external data. |
| Foreign administrative hierarchy should not imply complete city/LGA data for every country | **Valid modeling caution.** The current model supports dynamic type/level/parent references; the public form already labels the field State / Province / Region and only requires Nigerian LGA selection. | No schema rewrite required. Preserve dynamic labels and avoid claiming complete foreign locality coverage. |
| Development defaults should be blocked from production artifacts | **Partially already addressed.** Production seed rejects missing or known-default administrator credentials, and release packaging excludes populated environment files. | Keep the existing fail-closed seed rule and secret-exclusion packaging. Treat `uniportal_dev_pass` and local defaults as localhost-only values. |
| RLS needs a live role matrix | **Confirmed.** Static inspection cannot prove cross-student, cross-department, registrar, bursar, VC, and system-role behavior. | Remains a required target-environment certification gate; it must be run against real PostgreSQL roles and pooled/direct connections. |
| ERP needs stronger domain boundaries | **Valid architectural recommendation, not a release-blocking defect.** The Nest module structure already separates major domains. | No risky monorepo split was performed. Future work should enforce module dependency rules and avoid cross-domain service leakage. |
| Frontend lacks emergency-contact and previous-education parity | **Confirmed.** Backend DTOs accepted these fields while the public form omitted them. | Added emergency-contact and previous-education sections and included them in the submission payload. |
| Frontend lacks a complete document portal and programme requirement builder | **Partially confirmed.** Backend capabilities exceed the current public/admin UI depth. | Not expanded blindly in this remediation pass because document upload and policy-builder UX require institutional workflow decisions. The backend rule engine is now authoritative and the gap remains explicitly documented. |
| All deployment targets should be treated equally as production-certified | **Rejected.** Multiple manifests improve portability but do not create provider-specific certification evidence. | Docker Compose/generic container topology is the canonical portable contract; Render/Vercel, Cloud Run, and ECS/Fargate are supported secondary targets requiring their own live certification. |

## Implemented source changes

The confirmed code changes are concentrated in the admissions domain, verification tooling, seed determinism, and the public application workflow. The eligibility engine now honors `minOLevelCredits`, `maxOLevelSittings`, `requireEnglish`, `requireMathematics`, age limits, required documents, required O’Level subjects, and alternatives. Distinct credited subjects are counted across combined sittings, preventing repeated English, Mathematics, or other subjects from inflating eligibility.

The bulk screening workflow now has a side-effect-free preview mode. Real screening transitions use the existing canonical status transition path, which updates applicant and application states, creates decisions/offers when applicable, writes outbox events, and records audit information. The current status transition path also persists rejection metadata for `INELIGIBLE` outcomes.

The public application form now exposes the already-supported emergency-contact and previous-education structures. The application idempotency finding was not changed because current source inspection confirmed that the header is already produced correctly through the API client options contract.

## Validation evidence

| Validation | Result |
|---|---|
| API type-check after remediation | Passed |
| Web type-check after remediation | Passed |
| Focused admissions suite | 21 tests passed |
| Full serial monorepo suite | 28 API suites, 401 API tests passed; web has no unit tests and exits successfully |
| Pact consumer test | Passed |
| Portable `cross_layer_audit.py` from `/tmp` | Passed; 339 backend routes and 216 frontend API calls discovered |
| Portable `scan_architecture.py` from `/tmp` | Passed; 345 backend route decorators and 34 literal frontend API calls discovered |
| Docker runtime certification | Not executed in this sandbox because Docker Compose is unavailable |
| Live Pact provider verification | Requires real PostgreSQL and a running API; not claimed as passed |
| Live RLS role matrix | Still required on the target PostgreSQL deployment |
| Paystack/Remita/JAMB/WAEC certification | Still requires institution-owned credentials, provider contracts, and sandbox/live evidence |

## Release classification

The resulting release is suitable for controlled staging and pre-production deployment. It is not automatically production-certified merely because the source-level test suite is green. Production approval remains conditional on live infrastructure and institutional sign-off for RLS isolation, Redis durability and worker singleton behavior, object storage, authentication cookies and MFA, backups/restoration, email/SMS, payments, admissions provider verification, observability, and incident response.


## Second forensic attachment — V43.1 review

The second attachment was compared against the current post-V43 source tree. The following findings were confirmed and implemented:

| Finding | Status and implementation |
|---|---|
| Public form omitted `admissionType` while the DTO required it | Fixed. `admissionType` is now optional for compatibility, the service derives it from the selected admission cycle, and conflicting client values are rejected. Regression tests cover omission and conflict. |
| Nigerian-only phone validation contradicted international admissions | Fixed. Applicant and guardian DTOs accept either an 11-digit Nigerian local number or an international `+countrycode` number; the public form now uses a telephone input and contextual examples. |
| Unverified O’Level results could influence eligibility | Fixed. Programme eligibility and the staff O’Level check use verified sittings only. A staff-only verification transition endpoint now records verified/rejected status, reviewer identity, timestamp, and remarks. |
| JAMB provider worker lacked an executable manual fallback | Fixed. A staff-only manual JAMB verification endpoint now persists verified status and score with audit metadata. The provider worker continues to fail closed into manual review until an institution-owned provider integration is configured. |
| Privacy export compared `Applicant.personId` with a User ID | Fixed for linked applicant/student identities. Export resolution now uses Student → User and includes person, address, guardian, emergency contact, education, document, and O’Level information. |
| Erasure covered only User and Student records | Improved. Retained identities now pseudonymize Applicant, Person, contacts, addresses, education, document references, O’Level identifiers, admission identifiers, and sensitive fields while preserving academic/compliance history. |
| Examination reference data omitted NBAIS Tahfeez and distinct NABTEB routes | Fixed in deterministic seed data with NBAIS Tahfeez and NABTEB NTC, NBC, ANTC, and ANBC types. |
| AWS CodeDeploy revision was incomplete | Fixed. The workflow now builds shared runtime packages, generates Prisma, packages the workspace manifests, compiled API, Prisma schema, packages, scripts, and PM2 config, installs dependencies before schema deployment, and uses the supported controlled schema script. PM2 entrypoints and the service health port were corrected. |
| CI integration image lacked pgvector | Already fixed in the current tree and retained; CI now explicitly uses `pgvector/pgvector:pg16`. |
| AWS CloudFront/Next.js topology | Confirmed as an open architecture decision rather than safely patchable by a local edit. Terraform currently models S3 as the default origin while the web image is a standalone Next.js server. The release register requires an explicit ALB/ECS web-origin decision or a deliberate static-export redesign before AWS public production. |
| CAPS lifecycle, regulatory-policy layer, migration baseline, dynamic provider certification, load, RLS, and backup/restore | Confirmed as genuine remaining production gates or larger domain initiatives. They were not superficially implemented because doing so without institutional rules, schema migration governance, or live provider evidence would create misleading certification. |

The authoritative status register is now `RELEASE_STATUS.md`. It records each finding’s status, evidence, residual risk, and owner. The release remains controlled staging / pre-production ready and is not certified for live public admissions.

## Updated validation after second-attachment remediation

Type-check passed for all 9 Turbo tasks. The complete serial suite passed with 28 API suites and 401 API tests, plus 36 utility tests. The focused admissions suite now passes 23 tests. Lint and production builds passed. Docker runtime and live cloud execution remain target-environment certification activities.


## Third forensic attachment — V43.2 review

The third attachment was checked against the current working tree rather than only against its filename. It correctly withdrew several V43.1 findings that were already fixed, but identified additional defects that were confirmed and remediated.

| Attached finding | Assessment | Action |
|---|---|---|
| Alumni profile IDOR | Confirmed. GET/PATCH previously trusted the UUID and did not enforce owner or administrative authorization. | Added owner-only update, VC/SUPER_ADMIN override, private-profile access control, and public response minimization. Added dedicated tests. |
| AWS ALB target on port 3000 while API listens on 3001 | Confirmed. | Updated target groups, security groups, health checks, and workflow smoke test to API port 3001. The Next.js public origin remains a separate cloud architecture decision. |
| ALB health path required privileged authorization | Confirmed. | Public liveness and readiness probes are now available; detailed health and integration diagnostics remain privileged. |
| ECS CodeDeploy IAM policy used for Server deployment | Confirmed. | Replaced the ECS-specific managed policy with the EC2/Server CodeDeploy service-role policy. |
| 10%-for-5-minutes canary claim | Confirmed documentation/configuration mismatch. | Removed the unsupported canary claim and documented the actual blue/green `OneAtATime` strategy. |
| Count-based application number generated outside the insert transaction | Confirmed. | Prefix allocation now occurs inside the same transaction and advisory-lock scope as applicant/application creation. |
| Idempotency pre-read/create race | Confirmed. | Unique-key conflicts with an idempotency key now perform bounded replay lookup and return the committed result when available. |
| O’Level sitting rows can disagree on metadata | Confirmed. | Authority, type, candidate category, year, and exam classification must be consistent across every row in a sitting. |
| Duplicate exam-type authority semantics | Confirmed. | Controlled authority/type references derive the canonical exam enum; contradictory client values are rejected. |
| Selective rather than comprehensive RLS | Confirmed as an accurate limitation, not a new universal-RLS defect. | Release documentation now states that RLS is selective and application authorization protects additional domains. Live role-matrix certification remains open. |
| Applicant/person DSR architecture | Confirmed as incomplete for applicants without Users. | Linked applicant export and erasure coverage was improved; a canonical applicant/person DSR subject model remains an explicit architecture gate rather than an unsafe partial schema change. |
| Plaintext clinic genotype/allergies/chronic conditions | Confirmed. | Sensitive fields are now encrypted at write time, decrypted only for authorized profile reads, omitted from broad list/appointment summaries, and sized for ciphertext. Legacy plaintext rows require an operational re-encryption pass. |
| Remita, CAPS, refunds, migration baseline, backup/load/RLS certification | Confirmed as external or larger domain gates. | Not faked. These remain explicit owners-and-evidence gates in `RELEASE_STATUS.md`. |
| Reported route-ordering defects | Partially confirmed. | The actual current tree had two real same-shape shadowing defects: audit summary and clinic `patients/me`; both were reordered. Other cited candidates already had literals before parameters and were not changed. |

## Third-review validation state

The API type-check passed after the fixes. Focused admissions and alumni tests passed with 28 tests. The full monorepo regression suite then passed with 29 API suites and 408 API tests, plus the utility suites. Lint, production build, deployment-artifact validation, YAML parsing, and shell syntax checks also passed. The release remains **controlled staging / pre-production ready**, not production-certified.


## Fourth forensic attachment — V43.3 review

The fourth attachment was compared with the current V43.2 tree rather than the older V43.1 archive it described. Most of its P0/P1 claims are now stale because V43.2 already fixed alumni authorization, audit-summary ordering, AWS port and health probes, CodeDeploy IAM, the smoke test, application-number allocation, idempotent replay, O’Level consistency, clinic sensitive-field encryption, and the readiness endpoint.

One additional route defect was confirmed in the current tree: `POST timetable/:id/attendance/:studentId` preceded `POST timetable/:id/attendance/bulk`, allowing `bulk` to reach UUID parsing as a student ID. The bulk route was moved before the parameterized route. The attachment’s CI-readiness concern was also checked: normal CI uses the now-public `/api/health/ready`; the disaster-recovery workflow and queue-health script still referenced stale `/api/health`, so both were updated to `/api/health/ready`.

The attachment’s remaining architecture findings remain valid but are not safe to fake as completed implementation: a consolidated Prisma migration baseline, comprehensive RLS across every sensitive table, canonical Applicant/Person DSR subjects for applicants without Users, AWS Next.js public-origin selection, live Remita/JAMB/CAPS/payment certification, a full refund workflow, and retirement of the SSH deployment path after CodeDeploy staging proof. Those are recorded as open gates in `RELEASE_STATUS.md`.

## Fourth-review validation

The clean-tree validation passed with frozen installation, Prisma generation, 9 type-check tasks, 29 API suites and 408 API tests, 36 utility tests, lint, production builds, deployment-artifact validation, shell syntax checks, and YAML parsing for Compose, AppSpec, CI, CodeDeploy, and DR workflows. The route report utility still prints order-insensitive candidates; direct inspection confirms the relevant literals now precede parameter routes, including audit summary, clinic self-profile, alumni literals, and exam timetable bulk attendance.


## Fifth forensic review remediation — V43.4

The fifth attachment was traced as a cross-module admission-to-alumni lifecycle audit. The confirmed source-level defects below were repaired without redesigning the ERP’s module boundaries.

| Priority | Finding | V43.4 disposition | Evidence in source |
|---|---|---|---|
| P0 | Accepted programme could diverge from matriculation programme | Fixed | `StudentsService.matriculate()` now requires the latest accepted `AdmissionOffer` and uses its programme, department, and curriculum. Missing placement fails with `ADMISSION_PLACEMENT_REQUIRED`. |
| P0 | ACCEPTED → CLEARANCE → MATRICULATED contradiction | Fixed | Matriculation accepts only `ACCEPTED` or `CLEARANCE`, matching the admission FSM. |
| P0 | Institutional matriculation could precede national CAPS acceptance | Source-level gate fixed; live provider certification remains open | `CapsAdmissionStatus` and CAPS metadata were added. UTME, DE, and TRANSFER matriculation requires `CANDIDATE_ACCEPTED`. |
| P0 | CourseOffering had no authoritative lifecycle | Fixed | `CourseOfferingLifecycle`, migration `0030_course_offering_lifecycle_v43_4`, audited transition endpoint, and registration-open enforcement were added. |
| P0 | Exam attendance was disconnected from result absence | Fixed | Draft result generation reads `ABSENT`/`NO_SHOW` attendance and persists `StudentResult.absentFromExam`. |
| P0 | Mixed grading systems could corrupt CGPA/transcript classification | Fixed | CGPA, transcript, and semester-report aggregation reject mixed `gradingSystemSnapshot` values with `GRADING_SYSTEM_MIXED`. |
| P1 | CourseOffering.maxStudents was not enforced | Fixed | Capacity is checked under the student advisory lock for `REGISTERED` and `COMPLETED` registrations. |
| P1 | Fee clearance was global rather than period-aware | Improved | `StudentFee.semesterId` and migration `0034_semester_fee_clearance_v43_4` were added. Registration checks outstanding fees for the selected semester and falls back to the legacy boolean only for older rows without semester linkage. |
| P1 | LMS submissions overwrote evidence | Fixed | Unique submission-per-content/student was replaced by attempt numbering under an advisory lock; late-policy and max-attempt fields were added. |
| P1 | LMS due dates and late policies were missing | Fixed | Course content now supports availability start/end, due date, late-submission permission, penalty metadata, and attempt limits. |
| P1 | LMS grades did not flow into the gradebook | Fixed | An optional content-to-assessment-component link now causes graded LMS submissions to upsert the corresponding `AssessmentMark`. |
| P1 | Optional assessment components were treated as required | Fixed | Gradebook completeness now evaluates only `isRequired` components. |
| P1 | Assessment evidence was not reproducible from StudentResult | Fixed | Draft results snapshot the active scheme, component metadata, raw marks, mark versions, and final score in `assessmentEvidence`. |
| P1 | DegreeAudit was not the graduation academic source of truth | Fixed | Graduation candidate creation and final graduation now require the latest current-curriculum DegreeAudit to be `ELIGIBLE`, alongside administrative clearance. |
| P1 | Suspension/deferment/withdrawal did not propagate downstream | Improved | `ON_HOLD` registration status, plan status transitions, and DegreeAudit invalidation were added; reinstatement restores held registrations and plans, while withdrawal drops registrations permanently. |
| P1 | Bulk exam attendance performed repeated candidate/user reads | Improved | Invigilator validation and candidate eligibility are now batched before attendance upserts. |
| P1 | Result publication lacked an explicit downstream contract | Improved | Senate publication now writes compatibility, `result.published`, and `academic.progression.refresh_requested` outbox events atomically with CGPA recomputation. |

The following recommendations remain **residual maturity or operational gates**, not silently certified fixes: OneRoster 1.2, full LTI Advantage grade return, learning-outcome and competency analytics, smart planning and early-warning automation, advisor workflow, full programme-transfer invalidation of plans/audits, live CAPS/provider certification, consolidated migration-baseline replacement, comprehensive RLS certification, backup/restore rehearsal, load testing, refund certification, cloud-origin selection, and institutional production sign-off. These remain explicitly tracked in `RELEASE_STATUS.md`.

Validation after the fifth-review changes passed with 9 monorepo type-check tasks, 29 API suites and 410 API tests, lint, production API/frontend builds, Prisma generation, and deployment-artifact validation. The release classification remains controlled staging / pre-production ready, not unrestricted production-certified.


## Sixth forensic review remediation — V43.5

The sixth attachment independently re-evaluated V43.4 and confirmed that the academic core is substantially hardened while several cross-module and runtime-certification risks remain. Confirmed code-level gaps that could be repaired safely were addressed as follows.

| Priority | Finding | V43.5 disposition | Evidence |
|---|---|---|---|
| P0 | `ACCEPTED` could bypass the declared `CLEARANCE` state | Fixed as explicit policy | `InstitutionSettings.requireAdmissionClearance` defaults to true and `matriculate()` requires `CLEARANCE`; a deliberate institution-configured exception can allow `ACCEPTED`. |
| P1 | Semester-fee absence fell through to legacy `feeCleared` implicitly | Fixed as explicit policy | Added `FeeClearancePolicy` with `SEMESTER_REQUIRED`, `ANNUAL_CLEARANCE`, and `NO_FINANCIAL_GATE`. The production default requires a semester fee record. |
| P1 | Quiz attempt limit ignored `CourseContent.maxAttempts` | Fixed | `startQuizAttempt()` uses configured `maxAttempts` under an advisory lock. |
| P1 | Quiz availability and late policy were not enforced | Fixed | Quiz start/submission enforce availability end, due date, and `allowLateSubmissions`; `submittedLate` is persisted on `QuizAttempt`. |
| P1 | Exam absence could coexist with a passing grade | Fixed defensively | ABSENT/NO_SHOW results use effective score zero and canonical `ABS`/zero grade point while retaining the raw source score in evidence. |
| P1/P2 | CourseOffering had no explicit programme/curriculum audience | Improved | Added nullable `curriculumVersionId` audience, creation validation, migration `0038_course_offering_audience_v43_5`, and registration mismatch rejection. Null remains valid for shared offerings. |
| P1 | Privacy export could silently complete empty or leave DSR status stale | Improved | Unsupported custom report kinds and missing subjects now fail explicitly; worker success/failure synchronizes the related DSR to `COMPLETED`/`REJECTED`. |

Several reported sixth-review items were already fixed in V43.4 and were not redundantly rewritten: accepted-offer placement, curriculum active-version uniqueness, capacity, LMS assignment deadlines and attempts, LMS grade linkage, required-component logic, evidence snapshots, mixed grading protection, degree-audit exceptions, academic-plan locking, result amendments/withholding, waiver concurrency, deterministic invoice generation, and the global response envelope.

The following remain explicit residual gates: real JAMB/WAEC/identity/O-Level provider verification; live PostgreSQL/RLS role matrices and structural hardening of unsafe Prisma access; browser-level API-to-UI E2E workflows; full programme-transfer/progression E2E testing; remaining direct queue-to-worker reliability conversion; report worker/data-layer authorization certification; adversarial finance concurrency tests; provider sandbox certification; load testing; disaster recovery and restore rehearsal; Redis/authenticated-health verification; reporting replica/object-storage certification; and institutional production approval. TeachingAssignment/workload, a generalized OfferingAudience model, a central workflow engine, learning outcomes, SIWES/practicum, accreditation evidence, quality assurance, offline support, integration registry, and analytics warehouse remain planned architecture work rather than unverified claims.

V43.5 validation passed with 9 monorepo type-check tasks, 29 API suites and 412 API tests, lint, production API/frontend builds, Prisma generation, and deployment-artifact validation. The release remains controlled staging / pre-production ready, not unrestricted production-certified.


## Seventh forensic review remediation — V43.6 final hardening

The seventh attachment directly inspected the V43.5 source and confirmed that its major academic-lifecycle repairs were genuine. It identified one material remaining source defect: course-offering capacity was checked under a student-scoped lock, allowing two different students to pass the same offering capacity check concurrently. It also identified governance and policy-invariant improvements.

| Priority | Finding | V43.6 disposition | Evidence |
|---|---|---|---|
| P1 | CourseOffering capacity race across different students | Fixed | Registration now acquires deterministic `course-offering-capacity:<offeringId>` advisory locks for every offering in sorted order before counting seats and inserting registrations. The existing student lock remains for credit-unit concurrency. |
| P2 | Historical completed registrations could consume seats | Fixed by explicit seat semantics | Capacity counts `REGISTERED` and `ON_HOLD`; historical `COMPLETED` registrations are excluded. `ON_HOLD` retains a reserved seat for temporary academic interruption. |
| P1 | `requireAdmissionClearance=false` was an ordinary powerful setting | Fixed as governance control | Changing the setting now requires a distinct active VC or Registrar approval reference, a reason of at least 10 characters, an effective date, and a structured audit metadata record. |
| P2 | Quiz deadline and availability-end configurations could contradict each other | Fixed | LMS content creation rejects invalid timestamps, start-after-end, due-before-start, and due-after-availability-end configurations. Availability end is the absolute hard cutoff. |
| P2 | Single curriculum audience is only an interim model | Deliberately deferred | Nullable `CourseOffering.curriculumVersionId` remains a safe interim model. A multi-audience `OfferingAudience` relation is documented as future architecture work rather than introduced prematurely. |
| P1/P2 | Absence semantics vary by institutional policy | Safe baseline retained; policy gate open | ABSENT/NO_SHOW remains canonical `ABS`/zero grade-point behavior with raw evidence. Excused, medical, and approved examination exceptions require Registrar/Senate policy before specialization. |

The seventh review’s external and environment-dependent findings remain open and are not falsely marked as source fixes: JAMB/CAPS and WAEC/O’Level provider certification; Remita and Paystack merchant verification; payment-reconciliation provider calls; SMTP/SMS/object-storage production validation; live PostgreSQL/RLS isolation matrices; direct queue/outbox conversion; programme-transfer lifecycle E2E; complete browser academic/finance E2E; backup/restore; load and concurrency rehearsals; cloud deployment rehearsal; and institutional approval.

The following remain planned maturity architecture rather than V43.6 blockers: pre-account applicant DSR subject model, annual financial-clearance authority, TeachingAssignment/workload, central workflow/approval engine, accreditation and QA/moderation evidence, SIWES/practicum, and outcome/competency mapping. The release deliberately avoids another broad rewrite and prioritizes integration correctness over feature quantity.

V43.6 validation passed with Prisma generation, 9 monorepo type-check tasks, 29 API suites with 415 API tests, lint, production API/frontend builds, and deployment-artifact validation. The release remains controlled staging / pre-production ready, not unrestricted production-certified.


## Eighth forensic review remediation — V43.7

The eighth forensic attachment re-evaluated the V43.6 source and found two material targeted gaps. The first was an LMS authorization-scope gap: staff-facing operations could receive a valid `courseOfferingId` without proving that the acting staff member controlled that offering. The second was an admission-clearance effective-date inconsistency: a future policy change could be recorded with an effective timestamp while matriculation continued to read only the current setting.

| Priority | Finding | V43.7 disposition | Evidence |
|---|---|---|---|
| P1 | LMS staff authorization was not offering-scoped | **Fixed** | `LmsService.assertStaffOfferingScope()` resolves the target offering’s lecturer, department HOD, and faculty dean. STAFF, HOD, and DEAN actors must match the relevant relation; REGISTRAR and SUPER_ADMIN retain institution-wide authority. The guard is applied to staff-facing content, announcements, quiz questions, submission and quiz-attempt marking, submission attachments, and discussions. |
| P1 | Admission-clearance policy effective date was not applied consistently | **Fixed** | Future approved changes are stored in `pendingAdmissionClearance`, `pendingAdmissionClearanceEffectiveAt`, and `pendingAdmissionClearanceApprovalRef`. Matriculation uses the pending value only when its effective timestamp is less than or equal to the current time. Migration `0040_scheduled_admission_clearance_policy_v43_7` adds the fields. |
| P2 | Approval-document reference was confused with the approver identity | **Improved** | The settings DTO now distinguishes `admissionClearanceApprovalReference` as the approver user UUID from `admissionClearanceApprovalDocumentReference` as the governance document number. |

The targeted source changes deliberately do not attempt another broad rewrite. The following findings remain residual gates or planned architecture: selective RLS and live role isolation; durable outbox conversion for admissions, privacy, reports, and fees; canonical pre-account DSR subjects; live JAMB, CAPS, WAEC/O’Level, payment, SMTP/SMS, and object-storage certification; refund lifecycle completion; finance adversarial scope and concurrency certification; operational re-encryption of legacy clinic plaintext; a consolidated migration baseline; institution-specific absence-policy variants; multi-audience `OfferingAudience`; `TeachingAssignment` and workload modeling; and a central workflow engine.

## V43.7 validation evidence

| Validation | Result |
|---|---|
| Prisma generation | Passed for API and shared Prisma-client package. |
| Monorepo type-check | Passed; all 9 Turbo tasks completed. |
| Focused LMS and StudentsService regression suite | Passed; 2 suites and 49 tests. |
| Complete serial monorepo test suite | Passed. |
| Lint | Passed. |
| Production API/frontend build | Passed; NestJS API and Next.js 16.3.1 frontend built successfully. |
| Deployment-artifact validation | Passed. |

The V43.7 release is suitable for controlled staging and pre-production deployment. It is not automatically production-certified because live PostgreSQL/RLS, provider, queue, storage, payment, browser, backup/restore, load, cloud, and institutional approval evidence remains required.


## Follow-up forensic review — V43.8 candidate integration, reliability, and security hardening

The follow-up attachment confirmed that the V43.7 LMS offering-scope and admission-clearance effective-date repairs are genuine. It also identified one actionable LMS policy refinement and a systemic asynchronous reliability gap. The source was changed selectively rather than introducing a broad TeachingAssignment, DataSubject, RLS, refund, or examination-engine rewrite without institutional policy and live-environment evidence.

| Priority | Finding | Disposition | Evidence |
|---|---|---|---|
| P1/P2 | Single `CourseOffering.lecturerId` does not model co-lecturers, TAs, delegation, or temporary teaching authority | Residual architecture gate | No `TeachingAssignment` model exists. The current single-lecturer model remains explicit and is not falsely presented as complete university workload/authority modeling. |
| P1 | New LMS scope logic lacked adversarial authorization coverage | Improved | Tests now exercise lecturer allow/deny, HOD department allow/deny, dean faculty allow/deny, registrar and super-admin authority through `getCourseContent()`. |
| P2 | Completed registrations were treated as active for every LMS operation | Fixed in source | Enrollment now accepts an action parameter. Completed registrations retain `VIEW` access but are denied for submission, quiz attempt, progress, and discussion actions. |
| P1 | Outbox documentation overstated PostgreSQL/Redis atomicity | Corrected | Comments now state that enqueue and `processedAt` are independent operations with at-least-once delivery. Stable event job IDs reduce duplicate queue jobs where Redis retains them. |
| P1 | Admissions JAMB scheduling used a direct post-commit queue call | Fixed in source | Application creation writes `admissions.jamb_verification_requested` inside the same transaction as the applicant/application records. The outbox routes it to the existing `verify-jamb` worker contract. |
| P1 | Finance invoice and reconciliation scheduling used direct queue calls | Fixed in source | Invoice generation writes `fees.invoice_generation_requested`; Remita callback processing writes `payment.reconciliation_requested`; both are routed to their existing workers. |
| P1 | Reports and privacy exports used direct DB-to-queue handoffs | Fixed in source | ReportJob plus domain event, and DSR/report-job plus domain event, commit together. Root-level payload forwarding preserves the existing report worker contracts. |
| P1 | Security reminder scheduling used a direct repeating queue call | Fixed in source | Incident creation writes `security.breach_reminder_requested`; the outbox preserves the `breach-<incidentId>` repeat key so `markNitdaNotified()` can cancel it. |
| P1/P2 | Universal durable consumer idempotency ledger is absent | Residual reliability gate | Stable BullMQ job IDs and deterministic payloads are now present, but downstream effects still require live duplicate-delivery testing and, where needed, consumer-side durable idempotency records. |
| P1 | DSR subject identity remains User-anchored | Residual privacy architecture gate | `DataSubjectRequest.subjectUserId` remains mandatory; canonical Person/DataSubject modeling for pre-account applicants is deferred. |
| P1 | RLS evidence remains baseline/selective rather than ERP-wide cross-user proof | Residual certification gate | Current integration evidence does not demonstrate Student A versus Student B read/write isolation across all sensitive modules. |
| P1 | External providers, finance reconciliation, refunds, DR/load, and cloud acceptance remain incomplete | Residual production gates | No source-only change can substitute for institution-owned credentials, provider contracts, live PostgreSQL/Redis, restore, load, or deployment evidence. |
| P2 | Academic calendar enforcement, assessment-to-result evidence, published-result amendments, high-stakes examination controls | Residual maturity/integrity work | These require cross-module policy and end-to-end certification rather than isolated service edits. |

## V43.8 candidate validation evidence

| Validation | Result |
|---|---|
| Prisma generation | Passed. |
| Monorepo type-check | Passed; 9 Turbo tasks. |
| Focused reliability/security/LMS tests | Passed; 8 suites and 140 tests. |
| Complete serial API suite | Passed; 30 suites and 419 tests. |
| Utility/package tests | Passed; 5 suites and 36 tests. |
| Lint | Passed. |
| Production API/frontend build | Passed. |
| Deployment-artifact validation | Passed. |

The candidate is suitable for controlled staging and pre-production deployment rehearsal. It is not production-certified until the residual live-environment, provider, data-protection, finance, academic-integrity, backup/restore, load, and institutional governance gates are executed and signed.


## Follow-up forensic review — V43.9 candidate certification hardening

The attachment independently inspected the V43.8 archive and confirmed that several older audit claims are stale. The current source contains the response-envelope interceptor, password-aware Redis health check, stable fee invoice derivation, student-linked fee authorization, safe internal redirects, role-scoped report authorization, and the V43.8 producer-side outbox conversion. Those items are not repeated as outstanding V43.9 defects.

| Priority | Finding | V43.9 disposition | Evidence |
|---|---|---|---|
| P1 | Fee-waiver approval can double-apply under concurrent approval | Fixed in source | `approveWaiver()` now locks `fee_waivers` before status read and `student_fees` before cap calculation/application. Focused tests verify both locks and ordering. |
| P1 | Privacy erasure returns the former email | Fixed in source | `erase()` no longer selects or returns the old email; privacy tests assert the response lacks `wasEmail`. |
| P1 | Sensitive RLS bypasses only warn | Fixed in source | `PrismaService` throws `RLS_CONTEXT_REQUIRED` for FORCE_RLS models accessed through the plain client while an ambient authenticated RLS transaction exists. Background/system work remains explicit through DirectPrismaService. |
| P1 | SUPER_ADMIN cap lock ends before the final write | Fixed in source | DirectPrismaService now exposes the required system delegates; cap lock, count, and user/role write run in one direct transaction. New UsersService tests cover create, full-cap rejection, and grant. |
| P2 | Payment reconciliation sweep can enqueue overlapping duplicate jobs | Fixed in source | Sweep jobs use deterministic `payment-reconcile:<paymentId>` IDs. The recoverable direct sweep remains intentionally separate from producer-side outbox events. |
| P1/P2 | Rate limiting is process-local under horizontal scaling | Fixed in source | Global throttler uses Redis-backed Lua-atomic hit/block storage and fails through Redis errors instead of silently reverting to process-local behavior. New tests cover hits, blocks, and Redis failure. |
| P2 | Report storage fails late | Fixed in source | Shared environment schema rejects staging/production startup without `S3_REPORTS_BUCKET`; local development and tests remain flexible. |
| P1 | Canonical data-subject identity remains User-centric | Residual architecture gate | `DataSubjectRequest.subjectUserId` still cannot represent pre-account Applicants cleanly. A governed Person/DataSubject model and migration are required. |
| P1 | DSR request durability and failure status semantics | Residual workflow/schema gate | Erasure’s DSR remains tied to the User foreign key and is created in the mutation transaction. Durable pre-account subjects, failure states, and receipt-before-processing require a coordinated schema/workflow change. |
| P1 | Complete governed DSR inventory | Residual compliance gate | The export is broad, but a formal table/field/retention/legal-basis/erasure mapping is not yet generated from a governed inventory. |
| P1 | Comprehensive RLS matrix and transaction lifetime | Residual certification/performance gate | Fail-closed sensitive bypass is now present, but live cross-user PostgreSQL testing and short-transaction migration remain required. |
| P1 | Remita, JAMB, WAEC, Paystack provider certification | Residual production gate | Reliable queueing is not equivalent to provider implementation, credentials, sandbox/pilot execution, or settlement certification. |
| P1 | Refund lifecycle and ledger | Residual finance gate | Approval, execution, provider refund, reconciliation, reversal, chargeback, retry, and immutable ledger evidence remain incomplete. |
| P1 | Academic lifecycle, assessment/result, published-result amendment E2E | Residual academic-integrity gate | Source foundations are present but full applicant-to-alumni, assessment-to-result, manual-result, correction, approval, and repeat/resit evidence requires integrated environment testing. |
| P1 | Production schema baseline, clinic re-encryption, DR/load/cloud | Residual infrastructure/data-protection gates | These require fresh/upgrade/rollback migrations, operational encryption migration, PostgreSQL/Redis recovery, load, cloud, and institutional evidence. |
| P2 | TeachingAssignment, calendar policy engine, high-stakes examinations, policy history, browser E2E | Residual maturity gates | These are intentionally not broad-rewritten in V43.9; they require policy and acceptance design. |

## V43.9 validation evidence

| Validation | Result |
|---|---|
| Prisma generation | Passed. |
| Monorepo type-check | Passed; 9 Turbo tasks. |
| Complete API suite | Passed; 32 suites and 426 tests. |
| Utility/package tests | Passed; 5 suites and 36 tests. |
| Lint | Passed. |
| API/frontend/shared production build | Passed. |
| Deployment-artifact validation | Passed. |

V43.9 is suitable for controlled staging and pre-production certification rehearsal. It is not a claim of live university-wide production readiness until the residual gates are executed and signed.


## Follow-up forensic review — V43.10 automated certification-gate semantics

The V43.9 follow-up independently verified the V43.9 hardening repairs and identified one actionable release-process defect: the production-certification runner’s final wording could be interpreted as completed institutional production certification even though runtime/provider stages depend on pre-existing approved evidence artifacts and readiness checks.

| Priority | Finding | V43.10 disposition | Evidence |
|---|---|---|---|
| P1 | Automated certification runner can overstate production certification | Fixed in scripts | `production-certification.sh` now identifies itself as an automated gate, ends with “Automated production-certification gate passed,” and explicitly requires independent runtime/provider evidence and institutional release approval. |
| P1 | Runtime evidence gate verifies artifacts rather than executing drills | Clarified in scripts | `runtime-certification-evidence.sh` now states that approved PASS artifacts are verified and that underlying drills are not independently executed or certified by the script. |
| P1 | Provider readiness is not payment lifecycle certification | Preserved and clarified | `external-provider-certification.sh` already performs readiness/connectivity checks and requires operator-approved sandbox lifecycle evidence; it does not invent provider-specific charge/RRR shapes or claim webhook/reconciliation certification. |
| P1 | Real PostgreSQL RLS cross-user/cross-scope matrix | Residual | Requires live data, concurrent identities, revoked sessions, and actual PostgreSQL execution. |
| P1 | Canonical Person/DataSubject model and durable DSR lifecycle | Residual | Requires coordinated schema, foreign-key, retention, legal-hold, and workflow design. |
| P1 | Complete governed PII inventory and DSR export certification | Residual | Requires institutional table/field/retention/legal-basis/erasure mapping. |
| P1 | Refund lifecycle, provider certification, webhook/reconciliation evidence | Residual | Requires real provider sandbox/pilot execution and an immutable finance/refund ledger workflow. |
| P1 | Applicant-to-alumni and registration-to-result academic E2E | Residual | Requires real database execution and institutional academic policy scenarios. |
| P1 | Published-result correction/versioning and assessment evidence traceability | Residual | Requires immutable amendment/version workflow, approval authority, and live evidence. |
| P1 | Production migration baseline, backup/restore, DR, load, cloud, queue recovery | Residual | Scripts/tooling do not substitute for executed drills and measured evidence. |
| P1 | Clinic legacy plaintext re-encryption | Residual | Requires operational encrypt/decrypt verification, plaintext scan, backup, and final sign-off. |
| P1/P2 | TeachingAssignment, calendar engine, high-stakes examination, browser E2E, reporting replica policy | Residual | Important maturity and acceptance work; no broad rewrite is justified by this attachment. |

The source-level V43.9 repairs remain closed: fee-waiver concurrency, old-email erasure disclosure, fail-closed RLS convention, SUPER_ADMIN cap race, refresh-token race, reconciliation sweep duplicate scheduling, distributed throttling, report S3 fail-fast, LMS permissions/scope, admission-clearance timing, response envelope, Redis health, invoice idempotency, fee identity, safe redirect, and HOD report scope.

## V43.10 validation evidence

| Validation | Result |
|---|---|
| Prisma generation | Passed. |
| Monorepo type-check | Passed; 9 Turbo tasks. |
| Complete API suite | Passed; 32 suites and 426 tests. |
| Utility/package tests | Passed; 5 suites and 36 tests. |
| Lint | Passed. |
| Production API/frontend/shared build | Passed. |
| Deployment-artifact validation | Passed. |
| Certification scripts | Shell syntax passed; development skip paths passed. |

V43.10 is a strong staging/pre-production candidate and an automated certification-gate candidate. It is not production-certified until independent runtime/provider artifacts are executed, attached, reviewed, and approved through institutional release governance.


## Follow-up forensic review — V43.11 integrated certification focus

The V43.10 ZIP was independently rechecked against the source. Two older findings are now explicitly closed: API E2E and database integration discovery are real and fail closed when empty because both Jest configurations set `passWithNoTests: false`; and the k6 performance fixture seeder exists, supports non-production environments, and refuses production use. These repairs do not imply that the associated business journeys or performance evidence are complete.

The former “published-result correction missing” finding is downgraded. ResultsService now implements amendment metadata, ResultVersion history, score/grade/grade-point changes, CGPA recomputation under a student advisory lock, audit logging, and an outbox event in the same transaction. The remaining requirement is live institutional/UAT certification of authority, approval level, evidence, and correction retrieval.

| Priority | Finding | V43.11 disposition | Evidence / next action |
|---|---|---|---|
| P1 | Canonical Person/DataSubject architecture | Residual | User-anchored DSR cannot fully represent pre-account Applicants; requires governed schema/migration design. |
| P1 | Durable DSR lifecycle and governed PII inventory | Residual | Requires receipt-before-processing, explicit failure/legal-hold states, immutable subject identity, and module-level data/retention/legal-basis mapping. |
| P1 | Refund lifecycle and ledger | Residual | No complete refund request/approval/provider execution/reconciliation/reversal/chargeback domain is present. |
| P1 | Provider lifecycles | Residual | Paystack/Remita readiness checks do not prove charge, webhook, duplicate/reorder, reconciliation, or RRR lifecycles; Nigerian provider certification remains external. |
| P1 | Real PostgreSQL RLS certification | Residual | Existing integration suite proves restricted role, selected FORCE RLS, no-identity leakage, and transaction scoping; full cross-domain/cross-scope/concurrent matrix remains required. |
| P1 | Academic, finance, browser, DR, load, migration, queue, clinic certification | Residual | Execute the new `CERTIFICATION_MATRIX_V43_11.md` against real staging infrastructure and the release artifact. |
| P1/P2 | Published-result amendment | Downgraded to UAT | Implementation is present and transactionally coupled to CGPA/audit/outbox; institutional governance and live scenario evidence remain. |
| P2 | TeachingAssignment, calendar engine, policy history, reporting topology, competency/SIWES/accreditation, advanced examination | Residual | Important maturity scope; no broad rewrite is justified before live certification. |

The V43.11 recommendation is therefore to stop adding generic modules and execute the integrated runtime, academic, finance, privacy, provider, browser, recovery, load, cloud, and institutional UAT matrix. The only source-level architecture changes still prioritized before that execution are an approved canonical DataSubject/Person model and a complete refund domain.

## V43.11 validation posture

The existing V43.10 automated gate remains valid: Prisma generation, 9 type-check tasks, 32 API suites/426 tests, 5 utility/package suites/36 tests, lint, builds, deployment-artifact validation, certification-script syntax, and development skip paths passed. The new V43.11 certification matrix is an evidence runbook and does not claim that those automated checks execute live certification.


## V43.12 candidate — Targeted privacy, admissions, registration, and graduation hardening (15 August 2026)

This wave follows the eighth forensic review and deliberately avoids another broad rewrite. Four P1 findings were genuine and are now repaired at source level.

### P1 findings fixed

**DSR subject identity and durable erasure.** `DataSubjectRequest` now has nullable canonical `subjectPersonId` and nullable `subjectUserId` with `ON DELETE SET NULL`; the DSR status enum includes `IDENTITY_VERIFICATION_REQUIRED`, `VERIFIED`, `PARTIALLY_COMPLETED`, `LEGAL_HOLD`, and `FAILED`. Migration `0041_privacy_subject_identity_v43_12` adds the schema support and the Person inverse relation. Privacy operations create the DSR before rectification, restriction, portability/export, or destructive erasure, resolve the canonical Person through the linked Student where available, and transition the durable record to `COMPLETED`, `LEGAL_HOLD`, or `FAILED` after processing. This removes the prior risk that account deletion could erase the compliance row or that a DSR existed only after destructive work.

**Unavailable admissions provider false success.** `AdmissionsService.markManualVerificationRequired()` performs the state transition and outbox write transactionally. JAMB and WAEC/O’Level worker paths now persist a manual-verification-required outcome and emit `admissions.manual_verification_required`; the outbox router creates the durable admissions work item. Provider unavailability is therefore visible and actionable rather than a successful-looking terminal job.

**Registration-window fail-open.** `StudentsService.assertRegistrationWindow(now, operation)` is the shared authority for registration and drop-course. It fails closed when the active academic calendar, authoritative open event, or close event is missing; honors event `endDate`; supports multiple registration periods deterministically; and preserves operation-specific errors for registration versus add/drop. Both `registerCourses()` and `dropCourse()` use this helper.

**Graduation concurrency.** `graduate()` now enters `runExclusive()`, acquires `pg_advisory_xact_lock(hashtext('graduation:<studentId>'))` first, then reloads and rechecks candidate approval, student status, academic eligibility, degree audit, and administrative clearance inside the same transaction. Graduation history, student status, alumni creation, candidate update, audit, and outbox effects remain atomic, and alumni creation is idempotent.

### Confirmed closed findings

The review confirms that the previously reported fee-waiver approval race, RLS ambient-context bypass, SUPER_ADMIN cap race, deterministic reconciliation job IDs, distributed throttling, report-bucket startup validation, LMS completed-registration permission gap, LMS offering-scope authorization, API E2E/database integration test discovery, k6 fixture safety, result-amendment transactionality, and automated certification-gate wording are closed or correctly downgraded to live UAT/evidence gates. These items are not reimplemented in V43.12.

### Residual gates

RefundRequest/RefundExecution/RefundReconciliation/Chargeback and ledger reversal remain an open finance-domain recommendation. Library and Hostel clearance events are not yet integrated into StudentClearance. Full Person/DataSubject coverage for pre-account applicants remains an identity-model gate. Real JAMB/WAEC/NECO/NABTEB/NBAIS provider lifecycles and approved manual fallback require staging evidence. Real PostgreSQL/RLS matrices, academic and finance E2E, browser journeys, assessment/result provenance, high-stakes examination controls, migration-baseline rehearsal, backup/restore, DR, load, queue recovery, clinic re-encryption, reporting topology, and institutional UAT remain open certification work.

### Validation and release posture

Prisma generation, all 9 workspace type-check tasks, 33 API suites with 432 tests, 5 utility/package suites with 36 tests, lint, production builds, deployment-artifact validation, and Prisma schema validation with local placeholder URL variables passed. The V43.12 source tree is suitable for controlled staging and deployment rehearsal. It is not production-certified until the live P1 evidence and institutional approvals are executed and signed.


## V43.13 follow-up candidate — Privacy hard-delete, Person intake, and calendar-integrity remediation (15 August 2026)

The supplied follow-up independently inspected the actual V43.12 source and correctly confirmed the four V43.12 repairs. It also identified one additional valid P1 defect that V43.12 understated: a physical `User.delete()` branch remained reachable when the narrow legal-hold and history checks returned false, even though the User model declares `deletedAt` soft deletion and “never hard-delete.” Because NotificationLog, SecurityIncident, DSR approval, audit, and other institutional records retain User references, physical deletion was unsafe as a general privacy path.

### New targeted repairs

**Physical User deletion is prohibited.** `PrivacyService.erase()` now always calls the in-place pseudonymization path. User email, password material, authentication state, activity state, and linked applicant/student PII are scrubbed as appropriate; `isActive=false` and `deletedAt` are set; historical audit payloads are pseudonymized; and the User row remains available for referential integrity and institutional history. The erasure response retains the compatibility fields but always returns `hardDeleted: false` and `pseudonymised: true`. The audit metadata records `hardDeleteProhibited: true`.

**Canonical Person DSR intake is available before account creation.** DPO-scoped staff and SUPER_ADMIN can call `POST /privacy/person/:personId/intake`. The service creates a durable DSR linked to `subjectPersonId`, optionally links exactly one Student User, leaves `subjectUserId` null for a pre-account applicant, and marks the request `IDENTITY_VERIFICATION_REQUIRED`. It does not falsely claim that unverified erasure, export, rectification, or restriction has completed. Verified Applicant → Person processing remains a separately governed implementation gate.

**Calendar configuration rejects invalid registration periods.** Calendar event writes now reject reversed event dates, registration close events before any opening, duplicate same-type events at the same start date, multiple closes within one opening period, and an opening range that extends beyond its close. This complements the V43.12 runtime fail-closed registration helper without attempting to create a broad calendar-policy engine.

### Confirmed closed findings

The follow-up confirms that DSR ordering and FK durability, explicit DSR statuses, unavailable-provider manual verification, registration fail-closed behavior, and graduation lock-first rechecks are closed in source. The static P1 academic-integrity, P2 operational-contract, and deployment-artifact gates independently passed against the V43.12 archive.

### Remaining gates

RefundRequest/RefundExecution/RefundReconciliation/Chargeback and ledger reversal remain an open P1 finance domain. Full verified pre-account Applicant → Person privacy processing remains a workflow gate after the new durable intake. Real JAMB/CAPS and WAEC/NECO/NABTEB/NBAIS provider lifecycles, migration baseline and rollback rehearsal, full PostgreSQL/RLS isolation, academic/finance lifecycle E2E, browser E2E, high-stakes assessment integrity, backup/restore, DR, queue recovery, load, clinic re-encryption, reporting topology, shared clearance-provider architecture, and institutional UAT remain open.

### Validation evidence

The revised candidate passed 33 API suites with 438 tests, 5 utility/package suites with 36 tests, 9 type-check tasks, lint, API and web production builds, deployment-artifact validation, Prisma schema validation with local placeholder URL variables, focused privacy/calendar tests, and source-level checks confirming no physical User-delete call remains in `apps` or `packages`. The extracted project has no Git metadata; therefore source-level hygiene checks were used instead of `git diff --check`. The release remains controlled staging / pre-production ready, not production-certified.


## V43.14 follow-up candidate — Academic-integrity and cross-module integration hardening (15 August 2026)

The new forensic attachment was checked against the V43.13 source rather than accepted solely on its narrative. It independently confirms the prior DSR, provider-worker, registration-window, graduation-lock, hard-delete, Person-intake, and calendar-integrity repairs. It also identifies valid academic-integrity defects at the boundaries between Assessment, Exams, Results, Outbox, Academic, LMS, and Students.

### Valid targeted repairs

**Shared academic offering authorization.** `AcademicOfferingAuthorizationService` now provides one policy for LMS, Assessment, and Exams. A STAFF actor must be the offering lecturer, or for exam operations an assigned invigilator. HOD and DEAN actors must own the offering’s department/faculty scope. Registrar and SUPER_ADMIN are explicit institutional overrides. Assessment writes, gradebook access, exports, uploads, finalization, result generation, exam timetable operations, candidate generation, attendance, exam reports, and ordinary class attendance now use the policy.

**Exam attendance and marks are connected to the canonical assessment stream.** Exam attendance is scoped to the timetable’s offering and assignment. A new exam-mark endpoint requires an eligible candidate and PRESENT/LATE attendance, verifies that the component is an active EXAM component for the same offering, and writes the mark into `AssessmentMark`. Migration 0042 adds nullable `examTimetableId` provenance and the result evidence includes that source link. This is a targeted integration repair, not a claim that the complete examination-board domain is finished.

**Assessment finalization now gates result generation.** HOD/DEAN/REGISTRAR/SUPER_ADMIN can finalize a complete offering gradebook. Ordinary mark entry cannot modify a `FINALIZED` mark, and draft result generation rejects incomplete or unfinalized marks. A formal controlled amendment/moderation workflow remains required for post-finalization corrections.

**Progression refresh is now durable and consumed.** Senate publication forwards the publishing actor with `academic.progression.refresh_requested`. Outbox routing sends the event to a dedicated `academic-progression` queue with a deterministic job ID. `AcademicProgressionProcessor` invokes the existing lock-protected, policy-aware `AcademicService.runProgression()` engine with retries. Live Redis failure/replay and full result-to-progression evidence remain required.

**Student lifecycle safeguards.** Student status changes now follow an explicit transition matrix and require a reason. Reinstatement restores only ON_HOLD registrations belonging to the current active academic period, preventing stale historical registrations from being resurrected. Institution-specific readmission policy and UAT remain required.

### Findings not treated as closed by source-only work

The refund domain remains absent. JAMB manual verification still requires a stronger external-evidence record and real CAPS/provider certification. Person/Applicant/Student historical-snapshot policy, shared clearance policy, complete exam-board moderation, migration baseline, PostgreSQL/RLS runtime certification, E2E, browser E2E, backup/restore, DR, Redis/queue recovery, load, reporting topology, privacy governance, and institutional UAT remain open.

### Validation evidence

The V43.14 candidate passed 36 API suites with 453 tests, 5 utility/package suites with 36 tests, all 9 workspace type-check tasks, lint, API and web production builds, deployment-artifact validation, P1 academic-integrity static validation, P2 operational-contract static validation, Prisma generation, and Prisma schema validation with local placeholder URL variables. Focused academic-integrity tests passed 5 suites with 45 tests. Expected resilience logs and the Next.js middleware-to-proxy deprecation warning are non-blocking.

The release remains controlled staging / pre-production ready, not production-certified.
