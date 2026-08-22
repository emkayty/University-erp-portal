# UniPortal ERP v43.14

## Complete User, Administrator, Operations, and Workflow Manual

**Document owner:** UniPortal Implementation and Operations Team  
**Prepared by:** Manus AI  
**Applies to:** The current `render-free-test` source line and its controlled staging/local deployment profile  
**Document purpose:** To explain what UniPortal contains, who may use each part, how the major workflows operate, how administrators configure and run it, and how users perform day-to-day work.

> **Important status statement:** This manual describes the capabilities implemented in the current source tree. The release is **controlled staging / pre-production ready**, not certified for unrestricted production university operations. Live PostgreSQL/RLS isolation, payment and admissions-provider certification, object storage, SMTP/SMS, backup restoration, disaster recovery, load testing, browser UAT, and institutional approval remain required gates.[1]

---

## Table of Contents

1. [How to use this manual](#1-how-to-use-this-manual)
2. [What UniPortal is](#2-what-uniportal-is)
3. [System architecture and data flow](#3-system-architecture-and-data-flow)
4. [Roles, delegated roles, and permissions](#4-roles-delegated-roles-and-permissions)
5. [Dashboard shell and common interface elements](#5-dashboard-shell-and-common-interface-elements)
6. [Public admissions and applicant journey](#6-public-admissions-and-applicant-journey)
7. [Authentication, account, and MFA](#7-authentication-account-and-mfa)
8. [Module-by-module feature manual](#8-module-by-module-feature-manual)
9. [End-to-end university lifecycle](#9-end-to-end-university-lifecycle)
10. [Configuration and institutional administration](#10-configuration-and-institutional-administration)
11. [Identity numbers and identity cards](#11-identity-numbers-and-identity-cards)
12. [Reporting, analytics, intelligence, and data quality](#12-reporting-analytics-intelligence-and-data-quality)
13. [Security, privacy, audit, and governance](#13-security-privacy-audit-and-governance)
14. [Background workers, queues, and reliability](#14-background-workers-queues-and-reliability)
15. [Local MacBook operation](#15-local-macbook-operation)
16. [Deployment and release administration](#16-deployment-and-release-administration)
17. [Troubleshooting guide](#17-troubleshooting-guide)
18. [Operational checklists](#18-operational-checklists)
19. [API capability catalogue](#19-api-capability-catalogue)
20. [Implementation status and limitations](#20-implementation-status-and-limitations)
21. [Glossary](#21-glossary)
22. [References](#22-references)

---

## 1. How to use this manual

This is both a **user manual** and an **implementation-aware administrator manual**. Ordinary users should begin with the role table and the relevant module in Sections 4 and 8. Registry, bursary, HR, academic, IT, security, and implementation personnel should also read Sections 3, 10, 13, 14, 16, and 18.

The words **must**, **should**, and **may** have operational meaning. “Must” identifies a safety, security, legal, or data-integrity requirement. “Should” identifies a recommended institutional practice. “May” identifies an optional capability or configuration.

The interface is role-aware. A user may see different navigation, cards, buttons, records, and actions from another user. A hidden menu item is not the only security control: the API authorization layer and PostgreSQL row-level security remain the enforcement boundary. If a user believes an expected module is missing, the first checks are the effective role, effective staff scope, institution feature flag, academic ownership, and current lifecycle state.

This manual intentionally distinguishes three conditions:

| Label                      | Meaning                                                                                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Implemented**            | The source tree contains the feature and its API/UI path.                                                                                        |
| **Configured**             | The feature is implemented but requires institutional settings, policies, credentials, or reference data.                                        |
| **Certification/UAT gate** | The source behavior exists, but it still requires live environment, provider, security, policy, or institutional evidence before production use. |

---

## 2. What UniPortal is

UniPortal is a university Enterprise Resource Planning system for the full institutional lifecycle: application, admissions, matriculation, academic registration, teaching, assessment, examination, results, progression, graduation, finance, people operations, campus services, alumni, governance, privacy, reporting, and operational reliability.

The current implementation is a **pnpm/Turborepo monorepo**. The backend is a NestJS modular monolith. The frontend is a Next.js App Router application. PostgreSQL is the authoritative relational datastore, Prisma is the data-access layer, Redis provides distributed coordination and throttling, and BullMQ processes durable background jobs. Shared TypeScript packages define contracts, environment validation, feature flags, encryption helpers, academic calculations, grading utilities, date logic, and other cross-layer behavior.[2]

| Layer            | Current responsibility                                                                                             | Main technology                                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Web              | Browser UI, dashboards, forms, responsive layout, role-aware navigation, action feedback                           | Next.js, React, Tailwind CSS, Zustand, TanStack Query |
| API              | Authentication, authorization, validation, business rules, transactions, REST endpoints, OpenAPI/Swagger           | NestJS 11                                             |
| Database         | Institutional records, academic history, finance, security, policies, RLS                                          | PostgreSQL 16, Prisma 6                               |
| Queue/worker     | Outbox delivery, reports, reconciliation, notifications, scheduled tasks, academic progression, provider fallbacks | Redis 7, BullMQ                                       |
| Shared contracts | Roles, scopes, DTOs, settings, student/result/common types                                                         | `packages/types`                                      |
| Shared utilities | Encryption, key versioning, CGPA, grading, currency, dates, domain calculations                                    | `packages/utils`                                      |
| Private files    | Reports, approved images, photos, documents, attachments                                                           | S3-compatible private object storage                  |

UniPortal is designed for Nigerian university operations while retaining a structure that can support broader international practice. Nigerian-specific examples include JAMB/UTME, O’Level verification, NBAIS/NABTEB reference types, Remita/TSA/Paystack integration points, ASUU calendar suspension handling, NYSC-related lifecycle data, IPPIS/PenCom payroll exports, NDPR-oriented privacy controls, and Nigerian five-point grading support. These should be validated against the institution’s current regulations before production activation.

---

## 3. System architecture and data flow

### 3.1 Request path

A normal authenticated request follows this sequence:

1. A user opens a Next.js page and the page loads its TanStack Query data hooks.
2. The browser calls the NestJS API under `/api/v1` using the authenticated session/access-token mechanism.
3. Authentication identifies the user and resolves the primary role, effective roles, staff scopes, institution, MFA state, and student linkage where applicable.
4. API guards apply role and scope rules. Business services apply ownership, academic period, lifecycle, and object-level rules.
5. Sensitive database reads use the request RLS context. PostgreSQL policies provide a second boundary against cross-institution or cross-object access.
6. The service validates the command, acquires any required advisory locks, performs a bounded transaction, writes audit/outbox records, and returns a response envelope.
7. The frontend renders success, error, loading, empty, or permission states. Critical mutations show loading and disable duplicate submission.

### 3.2 Asynchronous path

Long-running or externally dependent work is not expected to block the browser request. A business transaction records a durable event or outbox row. The worker dispatches the event to the correct BullMQ queue, performs the job with retry and idempotency protections, and records completion, failure, or manual-review status. Examples include reports, admissions-provider checks, invoice generation, payment reconciliation, privacy exports, notifications, security reminders, and academic progression refresh.

> The worker is a separate runtime responsibility. **Do not replace BullMQ with direct in-process background work and do not run API and worker behavior as one production process.**[3]

### 3.3 Data-integrity boundary

The academic domain engine is deterministic and pure. Application services are responsible for loading authoritative records, checking authorization and policy scope, executing transactions, and persisting the decision snapshot. PostgreSQL RLS complements—not replaces—application RBAC and ABAC. Results follow a controlled state machine and published-result amendments preserve evidence and recompute downstream academic values within a transaction.[4]

### 3.4 External integrations

The source contains integration points for Paystack, Remita, TSA/manual payment, JAMB, WAEC/O’Level evidence, SMTP, SMS/Termii, S3-compatible object storage, and LTI 1.3. A configured connector is not the same as a certified connector. Provider credentials, signatures, sandbox calls, webhook verification, failure behavior, reconciliation, and institutional operating procedures must be tested before enabling a provider in production.

---

## 4. Roles, delegated roles, and permissions

### 4.1 Canonical roles

| Role            | Typical institutional owner                   | Main purpose                                                                                                                                          |
| --------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPER_ADMIN`   | University IT/platform governance             | Full platform administration, security, settings, users, audit, reliability, and controlled override functions.                                       |
| `VC`            | Vice-Chancellor or delegated executive office | Institutional oversight, high-level approvals, governance, analytics, settings where permitted, and policy control.                                   |
| `REGISTRAR`     | Registry/academic administration              | Admissions, student records, curriculum, academic lifecycle, results governance, examination and records operations.                                  |
| `DEAN`          | Faculty leadership                            | Faculty-level academic oversight, approval and review, scoped student/academic operations.                                                            |
| `HOD`           | Department leadership                         | Department-level academic ownership, review, approval, teaching and result workflows.                                                                 |
| `BURSAR`        | Finance office                                | Fees, payment, clearance, waiver, financial reporting, and finance approvals.                                                                         |
| `HR_MANAGER`    | Human Resources                               | Staff records, salary grades, leave decisions, staff identity cards, and HR workflows.                                                                |
| `STAFF`         | Lecturer or operational staff                 | Only the delegated operational scopes granted to the staff member, such as lecturer, records, finance clerk, library, health, research, or transport. |
| `SUPPORT_STAFF` | Health, privacy, or security support          | Narrow support functions, especially health, DPO/privacy, or security incident scopes.                                                                |
| `STUDENT`       | Enrolled student                              | Own academic life, registration, results, fees, clearance, learning, services, identity card, and notifications.                                      |

### 4.2 Effective roles and scopes

The application distinguishes a user’s stored/primary role from **effective roles** and **effective staff scopes**. A currently active delegation or time-bounded assignment can grant an effective role or scope without changing the historical primary role. The dashboard uses effective context for navigation and labels. The backend remains authoritative.

Staff scopes currently include:

| Scope                    | Typical access area                             |
| ------------------------ | ----------------------------------------------- |
| `admissions`             | Admissions operational work                     |
| `admissions_corrections` | Controlled application correction workflows     |
| `finance_clerk`          | Operational finance/fee work                    |
| `hr_clerk`               | HR operational work                             |
| `lecturer`               | Course offering teaching and assessment scope   |
| `library`                | Library operations                              |
| `hostel`                 | Accommodation operations                        |
| `health`                 | Clinic/health operations                        |
| `transport`              | Transport operations                            |
| `research`               | Research operations                             |
| `alumni`                 | Alumni operations                               |
| `timetable`              | Examination/timetable operations                |
| `records`                | Student records and active-directory operations |
| `dpo`                    | Privacy and security-support operations         |

A scope can also carry department and faculty boundaries. An HOD, Dean, or delegated staff member should see only records and actions within the academic ownership that the API authorizes. A user should never treat a frontend filter as a security boundary.

### 4.3 Role-to-workspace overview

The following is a navigation-level overview. Individual buttons inside a page are narrower than the workspace itself.

| Workspace                        | Common roles                                                                            | Important scope/feature conditions                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Home and Notifications           | All authenticated users                                                                 | Notifications are personal/role-aware.                                                                                  |
| Admissions and Student Lifecycle | Super Admin, VC, Registrar, Dean, HOD, scoped Staff, Student for permitted self-service | Admissions scope, records scope, or page-specific object ownership may apply.                                           |
| Academic Operations              | Super Admin, VC, Registrar, Dean, HOD, lecturer/records Staff, Student for self-service | Assessment/results require lecturer or academic authority; curriculum and offerings require records/academic authority. |
| Teaching and Learning            | Super Admin, VC, Registrar, Staff, Student                                              | LMS feature flag and offering scope apply.                                                                              |
| Finance and People               | Super Admin, VC, Registrar, Bursar, HR Manager, scoped Staff                            | Finance, HR, payroll, and enterprise items remain action-specific.                                                      |
| Campus Services                  | All or service-scoped users                                                             | Library, hostel, clinic, transport depend on service role/scope and feature flags.                                      |
| Governance and Intelligence      | Super Admin, VC, Registrar, selected Staff                                              | Privacy/security require DPO scope; analytics/data-quality is role-gated.                                               |
| Administration and Platform      | Super Admin and designated governance roles                                             | Users, audit, reliability, and settings are highly restricted.                                                          |

### 4.4 Permission outcomes

When a user is not allowed to perform an operation, UniPortal should present one of four honest outcomes: the item is not displayed; the page shows a permission notice; the API returns a controlled forbidden response; or the action is disabled until a missing prerequisite is supplied. A user must not attempt to bypass a restriction by changing a URL, sending a custom request, or editing browser state.

---

## 5. Dashboard shell and common interface elements

### 5.1 Navigation hierarchy

The dashboard groups work into eight workspaces:

1. **Home** — Overview and Notifications.
2. **Admissions & Student Lifecycle** — Admissions, Students, Clearance, Identity Cards, Alumni.
3. **Academic Operations** — Academic Life, Curriculum, Course Offerings, Assessment, Exams, Results & Grades.
4. **Teaching & Learning** — Learning/LMS.
5. **Finance & People** — Fees & Payments, HR, Payroll, Enterprise Operations.
6. **Campus Services** — Calendar, Library, Hostel, Health, Transport.
7. **Governance & Intelligence** — Reports, Research, University Policies, Privacy Operations, Security Incidents, Smart Operations.
8. **Administration & Platform** — User Administration, Audit & Security, Reliability Operations, Settings.

Groups collapse to reduce cognitive load. The command palette uses the same filtered navigation context, so a user should not see a command for a workspace they cannot access.

### 5.2 Common page elements

Most pages use the following patterns:

| Element              | Purpose                                                                          |
| -------------------- | -------------------------------------------------------------------------------- |
| Breadcrumb/header    | Shows the current workspace and page context.                                    |
| Role/scope context   | Indicates the effective operating role or scope where the page needs it.         |
| Cards and sections   | Separate tasks, metrics, forms, records, and explanations.                       |
| Search/filter rail   | Narrows records server-side or client-side according to the page contract.       |
| Loading state        | Skeleton or text state while data is being fetched.                              |
| Empty state          | Explains that no records exist or no result matches a filter.                    |
| Error state          | Presents a brief user-facing explanation and preserves safe recovery.            |
| Primary action       | The main task for the page. It should have a loading state.                      |
| Destructive action   | Requires a confirmation and, for sensitive lifecycle actions, a reason.          |
| Toast/brief feedback | Confirms success or reports a failure after an action.                           |
| Responsive layout    | On small screens, controls wrap, tables scroll, and touch targets remain usable. |

### 5.3 General operating procedure

For any dashboard task, first verify that the page is the correct workspace and that the role/scope label matches the work you intend to perform. Read the explanatory note before submitting a high-impact action. Enter the smallest valid amount of information, submit once, wait for the loading state to finish, and read the success or failure feedback. Refresh only when the page indicates stale data or when a provider callback is expected.

---

## 6. Public admissions and applicant journey

The public application is available at `/apply`; application tracking is available at `/apply/status`. The applicant does not need an authenticated dashboard account to begin the public application, but the tracking credential returned after submission must be protected like a password.

### 6.1 Applicant preparation

Before opening the form, the applicant should prepare a valid email address, phone number in the required international/local format, identification details, programme preference, JAMB/UTME information where applicable, address, next-of-kin or guardian information, sponsorship information, emergency contact, previous education, O’Level results, approved passport photograph, and supporting documents. The applicant should use accurate legal names and consistent examination information.

### 6.2 Reference and programme selection

The application loads institution reference data such as countries, subjects, examination authorities, admission cycles, and public programmes. The applicant selects the admission cycle and programme choices available for that cycle. The server derives admission-type rules from the selected cycle and rejects contradictory legacy or client-supplied values.

### 6.3 Form sections

The current application form presents or supports the following sections:

1. **Application details** — admission cycle, application type, and programme choices.
2. **Personal information** — names, date of birth, gender, nationality, state or country of origin, and identity attributes required by policy.
3. **Identity verification** — institution-defined identity fields and evidence.
4. **Contact** — email, phone, and contact address.
5. **Programme choices** — first and alternative choices where configured.
6. **JAMB / UTME** — examination authority, registration number, score, and verification state where applicable.
7. **Residential address** — applicant’s current or permanent address.
8. **Parent / guardian** — responsible adult details.
9. **Sponsorship** — sponsor identity, relationship, and funding information where required.
10. **Emergency contact** — person to contact in an emergency.
11. **Previous education** — schools, qualifications, dates, and relevant evidence.
12. **O’Level results** — subjects, grades, sittings, examination authority, year, and verification evidence.
13. **Passport photograph** — controlled upload or pre-submit photo path; images must follow size/type rules.
14. **Review** — completeness, declarations, consent, corrections, and final submission.
15. **Application fee** — fee status and provider path when the cycle requires payment.

### 6.4 Drafts and correction requests

Where draft support is enabled, the applicant should save progress before leaving the page and return using the same application context. After submission, the applicant should use the official correction/change-request route rather than creating a second application to work around an error. Staff review and approve or reject change requests according to the admission cycle and permission.

### 6.5 Consent, payment, and submission

The applicant must read and accept the required privacy/application consent. Where an application fee is required, payment should be initiated only through the displayed approved provider path. The applicant must not share payment references or tracking credentials publicly.

On successful submission, UniPortal returns an application number and a 64-character tracking credential. Record both in a secure place. The credential is not stored as plaintext and is not shown again in status responses. Existing credentials should be treated as invalid if the institution performs a planned tracking-secret rotation.[5]

### 6.6 Check application status

1. Open `/apply/status`.
2. Enter the application number.
3. Paste the 64-character tracking credential.
4. Select **Check status**.
5. Read the status, completion percentage, offer deadline if present, and any institution message.
6. Keep the tracking credential private.

The status page is not a substitute for an official admission letter or a verified institutional communication.

### 6.7 Admissions staff procedure

1. Open **Admissions** from the dashboard.
2. Choose the relevant admission cycle.
3. Review application completeness and required evidence.
4. Inspect accessibility support and change requests.
5. Review O’Level rows and use the eligibility/read-only view to understand the deterministic result.
6. Record or confirm JAMB/UTME verification using the approved provider or the controlled manual-review path when the provider is unavailable.
7. Verify documents through the document verification action.
8. Run screening or bulk screening only when the cycle policy is complete.
9. Record the decision: offer, reject, waitlist, deferment, or another permitted status.
10. Use the audit trail and reason fields for every exceptional decision.

The API enforces cycle-scoped duplicate protection, idempotent public submission, programme requirements, verified-sitting rules, and admission-type controls. A provider-unavailable state must be treated as **manual review required**, not as successful verification.

---

## 7. Authentication, account, and MFA

### 7.1 Login

1. Open the institution’s configured web address.
2. Enter the registered email and password.
3. If prompted, complete TOTP MFA or use an approved backup code.
4. Wait for the dashboard to load.
5. Confirm the displayed name, effective role, and scope before starting work.

`SUPER_ADMIN`, `BURSAR`, and `VC` are configured as mandatory MFA roles in the current security baseline. An institution may extend that requirement through settings and policy governance.[2]

### 7.2 Password reset

1. Open **Forgot password**.
2. Enter the account email.
3. Follow the approved reset message or support procedure.
4. Set a long, unique password.
5. Sign in again and complete MFA.

Never send a password, reset token, MFA secret, or backup code to another person through an ordinary message.

### 7.3 MFA setup and backup codes

An authorized user or administrator opens the MFA setup flow, scans or enters the TOTP secret into an authenticator, confirms the one-time code, and stores the generated backup codes in a secure offline location. A backup code should be consumed only when the authenticator is unavailable. Administrators should revoke lost or suspected-compromised MFA material.

### 7.4 Logout and revoke sessions

Use the profile menu’s **Log out** action. If an account is compromised, an authorized administrator may revoke all sessions or revoke a specific user’s sessions. Session revocation is not a substitute for password rotation, MFA reset, key rotation, or incident response.

---

## 8. Module-by-module feature manual

This section covers the major user-visible pages and the corresponding backend capability families. Every page remains subject to role, scope, ownership, feature flag, lifecycle, and data-availability rules.

### 8.1 Overview dashboard

**Purpose.** The dashboard landing page is a role-aware command centre rather than a generic list of links.

**Elements.** It can show a greeting, role-specific summary, snapshot metrics, attention queue, smart summary, workspace cards, workflow steps, today’s priorities, quick actions, and a customization panel. The content changes according to effective role and permitted workspaces.

**How to use it.** Start with the attention queue, open the item that needs action, complete the workflow in the linked workspace, and return to the overview to confirm that the outstanding item changed. Do not infer that a metric is complete merely because it is visible; open the underlying record for a governed decision.

### 8.2 Academic Life

**Purpose.** Student self-service for the personal academic journey.

**Elements.** Journey readiness, next legitimate actions, degree audit, recommended academic plan, current courses, academic history, academic appeal, programme transfer, and interruption/deferment requests.

**Student procedure.**

1. Open **Academic Life**.
2. Read **Journey readiness** and any warnings.
3. Follow **Next legitimate actions** in the order shown.
4. Review the degree audit for completed, outstanding, compulsory, elective, and unresolved requirements.
5. Review the recommended plan before registering courses.
6. Open current courses to confirm the active registration set.
7. Use academic history to verify semester records.
8. Submit an appeal, programme transfer, or interruption request only when the institutional policy permits it and provide a clear reason.

A blank journey can be a valid empty state when the student has no degree audit, curriculum version, registration, result, or active plan. It is not evidence that the page is broken.

### 8.3 Admissions

**Purpose.** Manage admission cycles, applications, evidence, screening, decisions, and exceptions.

**Elements.** Cycle creation/activation, application list and detail, accessibility support, change requests, O’Level results and eligibility, verification actions, JAMB verification, document verification, screening/bulk screening, status transitions, offers, waitlists, deferment and related decision evidence.

**Operating rule.** Registry staff should establish the cycle and requirements first, verify evidence second, screen third, and make the decision last. Never approve an application based only on a client-supplied score or an unverified provider response.

### 8.4 Students and student records

**Purpose.** Maintain the student master record and academic lifecycle operations.

**Elements.** Student list, active-student directory, search, status, personal/contact data, programme/department fields, level, CGPA, fee state, registered courses, academic history, matriculation, status transition, graduation eligibility, graduation candidate approval, graduation, course registration, drop course, and profile detail.

**Records staff procedure.**

1. Open **Students**.
2. Use the search field or filters instead of downloading or copying a broad list unnecessarily.
3. For records-scoped staff, use the active-student directory; results are server-side filtered and paginated.
4. Open a student profile only for a legitimate operational purpose.
5. Confirm programme, department, level, academic year, status, and current registrations.
6. Use the relevant lifecycle action and provide a reason where required.
7. Confirm the success response and audit record.

The directory deliberately omits high-risk data such as NIN. “Full information” means full information appropriate to the user’s authorized operational purpose, not unrestricted disclosure of every stored field.

**Matriculation procedure.**

1. Ensure the applicant is in an allowed accepted/clearance state.
2. Confirm the admission cycle, programme, department, faculty, and entry year.
3. Confirm the institution’s current matriculation format in Settings.
4. Submit **Matriculate** once.
5. Record the returned matriculation number.
6. Do not manually edit an issued number to make it look consistent; use a governed correction process if an institutional error exists.

### 8.5 Curriculum

**Purpose.** Manage the academic hierarchy and curriculum structures.

**Elements.** Faculties, departments, programmes, courses, course codes, course metadata, prerequisites, programme-course relationships, offerings, and CCMA compliance checks.

**Typical procedure.**

1. Create or confirm the faculty.
2. Create or confirm the department under the correct faculty.
3. Create or confirm the programme under the correct department.
4. Create courses with unique codes and accurate credit units.
5. Add prerequisites only when a real academic dependency exists.
6. Attach courses to the programme/curriculum version with compulsory/elective rules.
7. Run compliance checks before opening registration.
8. Create course offerings in the relevant academic calendar and assign the responsible lecturer through the authorized offering workflow.

Do not delete or re-parent a live academic structure casually. Historical results and registrations depend on stable identifiers and snapshots.

### 8.6 Course Offerings

**Purpose.** Turn curriculum courses into semester-specific teaching instances.

**Elements.** Academic year, semester, section code, capacity, lecturer, curriculum audience, lifecycle state, filters, and controlled state transitions.

**Procedure.**

1. Open **Course Offerings**.
2. Select the academic calendar and semester filters.
3. Create an offering with the correct course, section, academic period, and capacity.
4. Assign the lecturer through the controlled staff assignment path.
5. Move the offering through its allowed lifecycle states.
6. Cancel only with institutional justification; do not use cancellation to erase historical activity.
7. Confirm that the assigned lecturer and HOD/Dean ownership match the intended scope.

Capacity checks are concurrency-hardened in source: active `REGISTERED` and `ON_HOLD` registrations consume capacity, while historical `COMPLETED` registrations do not.[1]

### 8.7 Assessment

**Purpose.** Enter, validate, review, and finalize continuous-assessment and examination marks for authorized course offerings.

**Elements.** Authorized offering selector, assessment scheme, components, weights, max scores, live gradebook, student rows, pagination, validated CSV upload, results assurance, autosave/provenance status, export, finalization, and draft-result generation.

**Lecturer procedure.**

1. Open **Assessment**.
2. Select an offering you are authorized to teach.
3. Confirm the course, section, academic period, and roster.
4. Create or review the assessment scheme and ensure component weights total correctly.
5. Enter marks in the gradebook or download the approved CSV template.
6. Validate student identifiers and score ranges before uploading.
7. Save in small, controlled batches when working with a large cohort.
8. Watch the autosave/status strip and the success/failure message.
9. Review **Results Assurance** for missing marks, out-of-range marks, identical-score clusters, and other anomaly signals.
10. Resolve issues before requesting or performing finalization.

**Governance procedure.** HOD/Dean/Registrar/Super Admin users review completeness, scope, and evidence before finalization. Finalized marks cannot be edited through ordinary entry. A correction must follow the approved amendment/moderation workflow.

### 8.8 Results & Grades

**Purpose.** Manage result records and the official result state machine.

**Lifecycle.** The principal flow is `DRAFT → HOD_APPROVED → [DEAN_APPROVED] → SENATE_PENDING → SENATE_PUBLISHED`, with rejection and withholding paths. Published amendments preserve version history, audit, and downstream recalculation.[4]

**Elements.** Single/bulk result entry, result actions, bulk action, amendment, withhold/release, course-offering report, semester report, student result view, and transcript.

**Student procedure.** Open **Results & Grades**, select the available result period, review each course, and open the transcript only after confirming the result state. A withheld or unpublished result is not a technical error; it may represent an academic, financial, clearance, moderation, or governance condition.

**Registry/exam-board procedure.** Review course-level evidence, confirm marks are complete and finalized, apply the correct approval action, record reasons for rejection/withholding, and publish only after policy approval. Never publish a result to bypass an unresolved assurance signal.

### 8.9 Exams

**Purpose.** Manage semesters, official examination timetables, venues, candidates, attendance, exam marks, and reports.

**Elements.** Semester creation/current semester, timetable entry, rescheduling, cancellation, candidate generation, candidate list, attendance bulk/single entry, exam-mark entry, attendance report, and candidate report.

**Procedure.**

1. Create or select the correct semester.
2. Confirm the official calendar and examination period.
3. Author timetable entries with course offering, venue, date, time, duration, and invigilation notes.
4. Generate eligible candidates.
5. Record attendance as present, late, absent, or the institution-approved status.
6. Enter exam marks only for eligible candidates with acceptable attendance according to policy.
7. Review attendance coverage and missing candidates.
8. Send the marks into the assessment/result evidence path.

Exam marks retain timetable provenance. Absence semantics and exception categories must be approved by the Registrar/Senate before production use.

### 8.10 Fees & Payments

**Purpose.** Manage fee schedules, invoices, waivers, payments, reconciliation, and clearance signals.

**Elements.** Fee schedules, fee types, amounts, due dates, level filters, invoice generation, student fee view, payment history, Paystack, Remita, TSA/manual payment, pending waiver approvals, approve/reject waiver, and provider webhooks.

**Student payment procedure.**

1. Open **Fees & Payments**.
2. Review the fee schedule and invoice amount.
3. Select the approved payment method.
4. Confirm the amount and institution before redirecting to a provider.
5. Complete payment on the provider page.
6. Return to UniPortal and wait for status reconciliation.
7. Do not submit a second payment merely because the first callback is delayed.
8. Contact the bursary with the payment reference if the status remains pending.

**Bursary procedure.** Create schedules, generate invoices, review payment history, monitor reconciliation, and approve/reject waivers according to cap and approval policy. Waiver approval is concurrency-protected in source; it still requires live finance UAT and segregation-of-duties sign-off.

### 8.11 Clearance

**Purpose.** Manage academic, financial, library, hostel, medical, and other institutional obligations required for a transition or graduation.

**Elements.** Clearance items, student checklist, clear, block, waive, pending queue, responsible role, status, and reason.

**Procedure.** Select or load the student, review each item, read the responsible role, and perform only the action your role permits. A block or waiver must include a clear reason. Do not use waiver as a substitute for correcting the underlying record.

### 8.12 Calendar

**Purpose.** Manage academic calendars and their lifecycle, including event dates and institutional interruption/suspension periods.

**Elements.** Calendar creation, active calendar, current calendar, events, activation, suspension, ASUU strike mode, resume, completion, event removal, and registration-window enforcement.

**Procedure.** Create a calendar with a valid academic year, open/close dates, and authoritative events. Activate only one current calendar when policy permits. For a suspension, record reason and evidence; resume only when an approved event window exists. Registration and drop-course operations fail closed when the authoritative window is missing or contradictory.

### 8.13 Learning / LMS

**Purpose.** Support course content, announcements, quizzes, assignments, progress, discussions, and LTI configuration.

**Student elements.** My courses, course content, announcements, quiz questions, attempt start, attempt submit, attempt history, assignment submission, attachment, progress, and discussion.

**Staff elements.** Add content, publish content, post announcements, create quiz questions, view/grade quiz attempts, view/grade submissions, manage discussions, and configure LTI where authorized.

**Student procedure.** Open **Learning**, choose a course, read published content, observe availability and due dates, submit work through the assignment path, and confirm the submission receipt. Completed registrations can retain historical read access while write actions are denied where policy requires.[1]

**Staff procedure.** Confirm offering ownership before adding or publishing content. Use the student/assignment/quiz marking queues and record grades with the correct score and feedback. Do not publish content or grade another lecturer’s offering without the authorized scope.

### 8.14 Library

**Purpose.** Manage library catalogue items, loans, renewals, returns, overdue items, and student self-service.

**Elements.** Item create/list/detail, loan, return, renew, my loans, overdue list, and library-scope operations.

**Student procedure.** Open **Library**, review current loans, renew eligible items, and return items through the institution’s physical process. If an item is overdue, resolve it through the library rather than repeatedly attempting renewal.

**Library staff procedure.** Create accurate item records, issue loans, process returns, monitor overdue items, and preserve the loan history needed for clearance.

### 8.15 Hostel & Accommodation

**Purpose.** Manage blocks, rooms, capacity, allocations, vacancy, and student accommodation view.

**Elements.** Blocks, rooms, room type/capacity, active allocations, room vacancy, allocate, vacate, and student’s own allocation.

**Procedure.** Create the block, create rooms, check capacity, select the student, allocate for the academic year, and confirm the transaction. The API rechecks gender policy, capacity, duplicate allocation, and concurrency. Students should use **My accommodation** to view block, room, status, and start date.

### 8.16 Health Clinic

**Purpose.** Manage patient profiles, appointments, clinical records, drugs, prescriptions, and stock.

**Elements.** Register patient, my patient view, patient history, appointment creation/status, clinical records, drug inventory, low stock, stock adjustment, prescriptions, and prescription history.

**Privacy rule.** Genotype, allergies, chronic conditions, and medical details are sensitive. The application encrypts sensitive attributes where implemented and minimizes broad list responses. Clinic staff must use the patient record only for a legitimate care purpose and must not export or share it casually.

### 8.17 Human Resources

**Purpose.** Manage staff records, salary grades, employment state, leave requests, and decisions.

**Elements.** Salary grade create/list, staff create/list/detail, retire, leave request, pending leave, approve/reject.

**Procedure.** Create a staff record with the correct employee number and department, assign the appropriate employment status, configure salary grade, review leave requests, and use retirement only when the formal HR decision exists. HR actions require a reason and should be reconciled with payroll and identity-card status.

### 8.18 Payroll

**Purpose.** Manage payroll runs, lifecycle actions, payslips, and statutory/institutional exports.

**Elements.** Payroll run create/list, run action, run payslips, staff payslip view, IPPIS export, and PenCom export.

**Procedure.** Create a controlled payroll run for the correct period, review staff inputs and exceptions, progress the run through its allowed state, inspect payslips, and export only after authorization. Treat exported payroll files as sensitive financial records.

### 8.19 Identity Cards

**Purpose.** Issue, verify, manage, and print institutional identity credentials.

**Elements.** My digital card, public QR verification, issue/replace, card register, search, suspend, revoke, selection, bulk PDF, built-in template, approved external artwork, photo, serial number, card number, expiry, and audit record.

**Student/staff procedure.** Open **Identity Cards**, review the digital card, print a personal card if authorized, and use the QR verification link when an external party needs to verify the credential. The public verification response is intentionally minimal.

**Registrar/HR procedure.** Select the holder type, select the active student or staff member, enter the expiry date, issue the card, and confirm the success response. Registrar/Super Admin may issue student or staff cards; HR Manager is limited to staff issuance by the current UI/API policy.

**Bulk print procedure.**

1. Open the card register.
2. Search or filter the relevant cards.
3. Select individual active cards or select all active cards in the filtered view.
4. Select **Download selected PDF**.
5. Save the returned PDF as a controlled institutional record.
6. Print on A4 at 100% scale with no fit-to-page adjustment.
7. Preserve the A4 page orientation.
8. Test on plain paper before card stock.
9. Cut using the card outlines or approved finishing process.

The renderer creates five complete ID-1/ATM-sized front/back card pairs on one A4 page. Each row contains the front and matching back side-by-side, producing five vertical rows and ten card faces on the page. The API accepts only active cards and limits a batch to 500 cards. Suspended, expired, revoked, or replaced cards are not accepted for bulk printing.[6]

### 8.20 Research

**Purpose.** Manage research people, projects, grants, expenditures, outputs, and summaries.

**Elements.** Project create/list/detail/update/status, members, grants, expenditures, outputs, people, and summary reports.

**Procedure.** Create the project with its owner and scope, add members, register grants, record expenditures against the correct grant, attach outputs, and progress the project state. Use summary reports for institutional oversight rather than editing the underlying financial or research evidence manually.

### 8.21 Alumni & Endowment

**Purpose.** Maintain alumni profiles, campaigns, donations, donation status, and reports.

**Elements.** Alumni list/profile, campaign active/all/detail/create/status, donation creation/status, donation report, profile edit, and campaign participation.

**Procedure.** An alumnus opens the profile, updates allowed contact fields, selects an active campaign, enters a donation, and waits for provider/status confirmation. Alumni staff manage campaigns and reconcile donation status. Profile updates are owner-limited unless a governance role has an explicit override.

### 8.22 Transport

**Purpose.** Manage vehicles, routes, trips, bookings, and transport status.

**Elements.** Vehicle create/list/status, route create/list/update, trip create/list/status, trip bookings, booking create/delete, and my bookings.

**Procedure.** Transport staff register vehicles and routes, schedule trips, update operational status, review bookings, and cancel or remove only permitted bookings. Students view available trips and manage their own bookings.

### 8.23 Reports

**Purpose.** Produce operational, financial, academic, enrolment, and analytics artifacts.

**Elements.** Report generation, job list/status, job download, enrolment, revenue, CGPA distribution, result statistics, institution dashboard, personal dashboard, HOD dashboard, department dashboard, and student analytics.

**Procedure.** Select a report type and valid parameters, submit the job, monitor the job status, download only when complete, and store the output according to retention policy. Report generation may be asynchronous; a pending state is normal.

### 8.24 Analytics

**Purpose.** Present governed institutional and departmental decision information.

**Elements.** Institution overview, department dashboard, audit summary, students by status, staff by status, admissions pipeline, fee collection progress, CGPA distribution, top action types, most audited tables, data readiness/data-quality checks, and freshness indicator.

**Procedure.** Select the analytics tab your role allows, read the freshness time, distinguish counts from decisions, and open source workflows for corrective action. Data-quality warnings indicate records that need review; they do not automatically change a student or result.

### 8.25 Smart Operations and intelligence

**Purpose.** Surface deterministic alerts, operational tasks, data-quality findings, academic journey readiness, and results-assurance signals.

**Elements.** Smart alerts, smart tasks, data-quality checks, academic journey readiness, next legitimate actions, completeness signals, anomaly signals, and identical-score clusters.

**Operating rule.** Intelligence is decision support, not an autonomous authority. A staff member must inspect the source record, apply policy, record the decision, and avoid treating an alert as proof of misconduct or eligibility.

### 8.26 University Policies

**Purpose.** Author, review, publish, acknowledge, revise, and archive policy documents.

**Elements.** Published policy list/detail, acknowledgement, policy CRUD, revisions, submit, review, publish, archive, and acknowledgement reporting.

**Procedure.** Draft the policy, create a revision, submit it for review, record the review outcome, publish only through the approved authority, and monitor acknowledgements. Operational academic policy records such as progression and academic-standing rules require complete required JSON fields and an approved scope.[3]

### 8.27 Privacy Operations

**Purpose.** Support data-subject access, correction, erasure, portability, restriction, and identity intake.

**Elements.** Subject access request, Person-linked intake, rectify, erase, export, restrict, legal-hold/partial/failure states, and audit evidence.

**Procedure.** Verify the subject, create the request before processing, record the lawful purpose and evidence, select the appropriate action, respect legal hold and retention rules, and inspect the final status. Erasure pseudonymizes/deactivates rather than casually physically deleting the User identity anchor because audit, notification, incident, and legal records require referential continuity.[1]

### 8.28 Security Incidents

**Purpose.** Record, contain, notify the relevant regulator/authority where required, and resolve security incidents.

**Elements.** Incident create/list, contain, NITDA-notified state, resolve, reason/evidence, and audit context.

**Procedure.** Create the incident immediately, classify the affected system/data, contain access where appropriate, preserve evidence, record notification decisions, and resolve only after remediation and sign-off. Do not delete the incident to hide an error.

### 8.29 Audit & Security

**Purpose.** Provide privileged audit log search, summary, and detail.

**Elements.** Filters, date ranges, actor, action type, target table, summary counts, detail view, and pagination.

**Procedure.** Search with the narrowest useful filters, inspect the event details, correlate the request ID or job ID, and export only under institutional retention policy. Audit logs are evidence, not a general browsing convenience.

### 8.30 Reliability Operations

**Purpose.** Inspect runtime version, database state, dead-letter queues, and replay controlled failed jobs.

**Elements.** Version, database health, dead letters, replay, worker state, and health checks.

**Procedure.** Start with health/readiness, inspect the dead-letter payload and failure reason, confirm that the underlying issue is fixed, replay only the specific safe job, and monitor the resulting queue and audit event. Do not replay a financial or privacy job without confirming idempotency and authorization.

### 8.31 Settings

**Purpose.** Configure institutional branding, academic/financial/security policy values, feature flags, identifier format, and identity-card design policy.

**Elements.** Public branding, capabilities, full settings, feature flags, matriculation format, sequence scope, identity-card template mode, background references, card colors, footer text, grading settings, clearance policy, fee-clearance policy, notification concurrency, and approval metadata.

Only authorized governance roles should edit settings. A configuration change is a business decision: enter a reason where required, verify that the value affects future operations as intended, and understand whether it is retroactive. Matriculation-number policy changes apply to future matriculations and do not silently renumber existing students.

### 8.32 Enterprise Operations

**Purpose.** Provide a categorized operational hub and context summary for records/operations users.

**Elements.** Operating context, domain cards, links to related workspaces, and role/scope explanation.

This page is intentionally a navigation hub and may not contain direct CRUD actions. Open the linked domain workspace to perform work.

### 8.33 Notifications

**Purpose.** Present role/user notifications and mark them read.

**Procedure.** Open Notifications, read the message, follow the linked workspace, and mark it read. A notification is an instruction or signal, not a substitute for opening and verifying the authoritative record.

### 8.34 Search

**Purpose.** Provide controlled global and domain searches across students, staff, courses, and library records.

**Procedure.** Use the smallest search term that identifies the record, confirm the result context, and open the record only for a legitimate purpose. Search results remain permission-filtered.

### 8.35 Public identity-card verification

**Purpose.** Let a verifier confirm whether a presented identity card is active without exposing unnecessary private information.

**Procedure.** Scan the QR code or open the verification link. Check the card number, serial, holder name, identifier, holder type, status, issue date, and expiry. Treat an expired, revoked, replaced, or otherwise invalid state as not currently valid and refer the holder to the institution.

---

## 9. End-to-end university lifecycle

### 9.1 Applicant to admitted student

The controlled lifecycle is:

`Reference data → Application draft → Evidence and consent → Fee/payment if required → Submission → Verification → Screening → Decision/offer → Acceptance/clearance → Matriculation → Student record`

Registry should preserve the application evidence and decision context. A student record should be created only through the governed admission/matriculation path.

### 9.2 Student academic lifecycle

`Student record → Curriculum audience → Course offering → Registration → Teaching/LMS activity → Assessment marks → Examination/attendance → Result draft → Academic approvals → Senate publication → Academic history/progression → Graduation clearance → Graduation → Alumni`

At each step, the authoritative academic period, programme, curriculum version, offering, and student status must be rechecked. A record from a previous period must not be resurrected simply because it still exists in the database.

### 9.3 Finance and clearance lifecycle

`Fee schedule → Invoice → Payment initiation → Provider callback/reconciliation → Student fee status → Waiver/exception where approved → Financial clearance → Registration/result/graduation gate`

Payment success must be based on verified provider or controlled manual evidence. A browser redirect alone is not proof of settlement.

### 9.4 Staff and payroll lifecycle

`Staff profile → Salary grade → Leave request/decision → Payroll run → Payslip → IPPIS/PenCom export → Retirement/deactivation → Retained audit identity`

HR, payroll, identity-card, and access deactivation should be coordinated. Retiring a staff member should not erase historical teaching, marking, payroll, audit, or authored content evidence.

### 9.5 Exceptions and conflicts

When two policies conflict, the system should fail closed or route to review rather than silently choosing a convenient result. Examples include a missing progression policy, contradictory calendar windows, an incomplete gradebook, a provider-unavailable verification, a full course offering, an unresolved clearance block, or a user whose delegated scope has expired.

---

## 10. Configuration and institutional administration

### 10.1 First-time foundation setup

1. Create PostgreSQL, Redis, and private object storage where required.
2. Generate independent local or production cryptographic material.
3. Set environment variables in an ignored secret store.
4. Install dependencies from the lockfile.
5. Generate and validate Prisma Client.
6. Apply the institution-approved schema synchronization procedure.
7. Bootstrap restricted database roles.
8. Seed only a non-production environment with explicit administrator credentials.
9. Configure Institution Settings and public branding.
10. Configure feature flags and enabled service modules.
11. Create approved academic policy records.
12. Create the academic calendar and reference data.
13. Create faculties, departments, programmes, courses, curriculum versions, and offerings.
14. Create users, roles, effective dates, scopes, and delegations.
15. Run health, authorization, RLS, provider, backup, and browser checks.

### 10.2 Institution settings

Common settings include institution name/code/type, website/contact, currency, fee-waiver caps, grading system, minimum/maximum semester credit units, mandatory MFA roles, branding colors/logo/favicon, feature flags, CORS origins, course-repeat policy, assessment weights, grading policy version, live gradebook enablement, result validation, admission-clearance policy, fee-clearance policy, notification rates, matriculation format/sequence scope, and identity-card template settings.

Do not copy settings between institutions without reviewing tenant identifiers, branding, policy approval, provider credentials, retention rules, and academic structures.

### 10.3 Academic policies

Progression and academic-standing policies are intentionally fail-closed. Before using progression, Registry must load and approve applicable policies for each programme or broader scope. Required progression fields include minimum credit units, unconditional progression CGPA, maximum carryovers for conditional progression, and conditional action. Required standing fields include probation and warning thresholds and consecutive-probation suspension limits.[3]

### 10.4 Feature flags

A disabled module should not be presented as available. When a module is enabled, its provider configuration, staff owner, policy, data retention, and support procedure should also be documented. Disabling a flag does not automatically erase historical records.

---

## 11. Identity numbers and identity cards

### 11.1 Configurable matriculation formats

The configured format supports `{INSTITUTION}`, `{FACULTY}`, `{DEPT}`, `{PROGRAMME}`, `{YEAR}`, `{ENTRY_YEAR}`, and exactly one final sequence token: `{SEQ}` or `{SEQ:05}`. For example:

```text
{INSTITUTION}/{YEAR}/{DEPT}/{SEQ:05}
```

may produce:

```text
UNI/2026/CSC/00012
```

The sequence scope can be institution-wide, admission-year-wide, or department-plus-year. PostgreSQL advisory locking protects concurrent allocation. Existing numbers are not silently renumbered after a policy change. The configuration affects future records only.[6]

### 11.2 Identity-card template choices

The institution may select:

- **Built-in template:** Uses configured primary/accent colors and fixed governed fields.
- **External artwork:** Uses approved front/back artwork references from private storage or explicitly allow-listed HTTPS media.

The system does not accept arbitrary remote image fetching. An unavailable approved asset falls back to the built-in layout instead of creating a broken PDF.

### 11.3 Card data and privacy

A card may show the holder name, student matriculation or staff employee identifier, programme or designation, department, card number, serial number, expiry, approved photo, and an opaque QR verification link. The public verification response must not disclose private contact data, address, date of birth, NIN, BVN, or medical details.

### 11.4 A4 five-card front/back print standard

The bulk renderer uses ISO/IEC 7810 ID-1 dimensions: 85.60 mm by 53.98 mm. Five cards are arranged in five vertical rows, with each front positioned beside its matching back horizontally. One A4 page therefore contains ten card faces representing five complete cards. Print at 100% scale, disable fit-to-page, preserve page orientation, and test alignment before card stock.[6][7]

---

## 12. Reporting, analytics, intelligence, and data quality

### 12.1 Reports versus analytics

**Reports** are artifacts or jobs generated for a defined purpose and period. **Analytics** are interactive summaries for decisions. A report may be downloaded; an analytics panel should usually lead the user to an operational action or source record.

### 12.2 Data-quality checks

The Intelligence Foundation includes deterministic checks such as missing academic relationships, inconsistent lifecycle records, incomplete results, unsupported values, and other source-defined integrity checks. A data-quality item should be handled as follows:

1. Open the check details.
2. Identify the affected record and owning office.
3. Verify whether it is a genuine defect, approved exception, or stale source data.
4. Correct it through the governed module workflow.
5. Re-run or wait for the next refresh.
6. Record an explanation for approved exceptions.

### 12.3 Academic Journey Navigator

The navigator does not invent a degree decision. It combines authoritative student data with deterministic readiness and next-action rules. It can indicate missing registration, incomplete results, outstanding clearance, unresolved curriculum allocation, or other legitimate next steps. The student and authorized academic staff remain responsible for the final institutional decision.

### 12.4 Results Assurance

Results Assurance displays completeness and anomaly signals such as unknown student marks, out-of-range marks, and identical-score clusters. These are review signals, not automatic misconduct findings. A lecturer or academic reviewer must inspect the underlying marks, assessment design, and evidence before changing anything.

---

## 13. Security, privacy, audit, and governance

### 13.1 Security model

The security baseline includes RS256 JWT signing, short-lived access tokens, refresh-token controls, secure cookies, AES-256-GCM encryption with key versioning for protected PII, MFA for high-risk roles, PostgreSQL RLS, request-scoped database identity, role/scope guards, rate limiting backed by Redis, structured request logging, and global error envelopes.[2]

These mechanisms reduce risk but do not by themselves establish certification. The institution still needs threat modelling, penetration testing, security training, incident drills, secret rotation, provider review, and evidence retention.

### 13.2 Privacy operating rules

Users should access only the minimum data necessary for the task. Do not copy student lists into personal spreadsheets unless the office has an approved purpose, retention, encryption, and disposal process. Use the active-student directory for operational lookup and open the full profile only when necessary.

### 13.3 Audit discipline

The following actions should be auditable: user/role changes, delegations, settings changes, admissions decisions, verification, result approvals/publication/amendment, waivers, payment/reconciliation decisions, privacy actions, identity-card issuance/lifecycle/export, security incidents, and reliability replay.

### 13.4 Data retention and deletion

Do not physically delete a record merely because a user requests removal or because a lifecycle has ended. Academic results, financial records, audit evidence, legal holds, security incidents, and statutory reports can require retention. Use the Privacy Operations workflow and institutional retention schedule.

### 13.5 Security incident procedure

1. Record the incident immediately.
2. Preserve logs, request IDs, affected records, and timestamps.
3. Contain compromised accounts, tokens, endpoints, or integrations.
4. Notify the DPO/security lead and institutional owner.
5. Determine regulator/authority notification requirements.
6. Remediate and verify.
7. Resolve with evidence and retain the incident record.

---

## 14. Background workers, queues, and reliability

### 14.1 Runtime responsibilities

| Process    | Port/role               | Responsibility                                                                    |
| ---------- | ----------------------- | --------------------------------------------------------------------------------- |
| Web        | 3000 locally            | Next.js UI and browser delivery.                                                  |
| API        | 3001 locally            | NestJS HTTP API and protected business operations.                                |
| Worker     | 3002 locally            | BullMQ processors, scheduled tasks, reconciliation, reports, outbox, and retries. |
| Redis      | 6379 locally            | Queue backend, cache/throttling/coordination.                                     |
| PostgreSQL | 5432 locally or managed | Authoritative records and RLS.                                                    |

### 14.2 Outbox and at-least-once behavior

The outbox provides durable event dispatch. Delivery is generally at-least-once, so consumers must be idempotent or use stable job identifiers. A duplicate delivery should not duplicate a payment, invoice, notification, graduation, report, or privacy mutation.

### 14.3 Dead-letter handling

A dead-letter item means automatic retries did not resolve the job. It does not mean the job is safe to replay blindly. Inspect the payload, determine whether the provider or data issue is fixed, check whether a partial result already exists, and replay only with authorization and an audit reason.

### 14.4 Health checks

Use:

```text
GET http://localhost:3001/api/health/live
GET http://localhost:3001/api/health/ready
GET http://localhost:3002/health/live
```

Liveness answers whether the process is running. Readiness checks the database and Redis path and may transiently fail while a managed database wakes up. Detailed diagnostics should remain privileged.

---

## 15. Local MacBook operation

This profile is designed for a resource-constrained MacBook: PostgreSQL and Redis in Docker; API, worker, and web as native Node processes. Avoid running unnecessary pgAdmin, Redis Commander, Playwright, and production compose services during ordinary development.[8]

### 15.1 Prerequisites

Use Node.js 22.x, pnpm 9.15.x, Docker Desktop with Compose v2, and enough memory for PostgreSQL/Redis. Close memory-heavy applications before building.

### 15.2 Obtain and configure the source

```bash
cd ~
git clone https://github.com/emkayty/University-erp-portal.git
cd ~/University-erp-portal
git checkout render-free-test
pnpm install --frozen-lockfile
```

Create local secrets from the repository’s environment example. Generate local-only JWT and encryption keys; never reuse local values in production and never commit `.env` files.

### 15.3 Start lightweight infrastructure

```bash
docker compose -f docker-compose.local.yml up -d
docker compose -f docker-compose.local.yml ps
```

Confirm PostgreSQL and Redis are healthy. If the project is using the already-created Redis container, the minimum check is:

```bash
docker start uniportal-redis-local 2>/dev/null || true
docker exec uniportal-redis-local redis-cli ping
```

Expected result: `PONG`.

### 15.4 Generate, validate, and synchronize schema safely

```bash
pnpm db:generate
pnpm db:validate
```

Use the repository’s controlled schema script and review any proposed diff before applying it. Do not use `--accept-data-loss`. Do not run `prisma migrate deploy` against this branch without an approved consolidated migration-baseline decision. The current release contains an unresolved retention review around authorization-governance schema history; stop if the schema operation proposes an unapproved destructive or cascade change.

### 15.5 Bootstrap roles and seed non-production data

```bash
POSTGRES_CONTAINER=uniportal_postgres_local pnpm db:bootstrap-roles
export SEED_ADMIN_EMAIL=admin@example.test
export SEED_ADMIN_PASSWORD='ChangeThisLocalOnly!123'
pnpm db:seed
```

Change any seeded administrator password immediately after first login. Use governed workflows to create student and staff records; do not fabricate academic records with raw SQL.

### 15.6 Start the three native processes

Open three terminal tabs.

**Tab 1 — API**

```bash
cd ~/University-erp-portal
pnpm --filter @uniportal/api dev
```

**Tab 2 — worker**

```bash
cd ~/University-erp-portal
PROCESS_ROLE=worker pnpm --filter @uniportal/api dev
```

**Tab 3 — web**

```bash
cd ~/University-erp-portal
pnpm --filter @uniportal/web dev
```

Alternatively, `pnpm dev` can start services in parallel on a stronger machine. On a low-memory MacBook, separate tabs make it easier to stop one process without destabilizing the others.

### 15.7 Verify

```bash
curl --max-time 15 -sS http://localhost:3001/api/health/live
curl --max-time 15 -sS http://localhost:3001/api/health/ready
curl --max-time 15 -sS http://localhost:3002/health/live
curl --max-time 15 -sS -I http://localhost:3000/auth/login
```

Open `http://localhost:3000`. The browser API URL must match the value embedded in the web build.

### 15.8 Stop and reset

Stop native processes with `Ctrl+C`. Stop infrastructure with:

```bash
docker compose -f docker-compose.local.yml down
```

Use `down -v` only when you intentionally want to delete local database and Redis volumes. Never use it against shared or production infrastructure.

---

## 16. Deployment and release administration

### 16.1 Required environment separation

| Variable group  | Rule                                                                             |
| --------------- | -------------------------------------------------------------------------------- |
| Database URLs   | Keep restricted runtime, direct/system, and migration identities separate.       |
| JWT keys        | Keep private signing key in a secret manager; public key must match it.          |
| Encryption key  | Keep exactly 64 hex characters and rotate through the approved dual-key process. |
| Redis           | Use TLS/private endpoint in production where supported.                          |
| Frontend origin | Use the exact HTTPS public origin for CORS and redirects.                        |
| Provider keys   | Enable only after sandbox/pilot certification.                                   |
| S3 and SMTP/SMS | Keep server-side; never expose private credentials to the browser.               |

### 16.2 Deployment order

1. Provision PostgreSQL, Redis, and private object storage.
2. Inject secrets without committing them.
3. Install with the frozen lockfile.
4. Generate and validate Prisma Client.
5. Apply the approved schema procedure or migration baseline.
6. Seed only a controlled non-production environment.
7. Configure policies, calendars, reference data, feature flags, and scopes.
8. Deploy the API, worker, and web separately.
9. Run health, E2E, RLS, provider, backup/restore, and load evidence.
10. Obtain Registrar, Finance, DPO, Security, IT, and institutional release approval.

### 16.3 Zero-cost MacBook + Neon profile

For the user’s zero-cost working profile, the practical arrangement is local Next.js/API/worker, Docker Redis, and managed Neon PostgreSQL. The profile is suitable for development and controlled rehearsals, not a high-availability production platform. Network interruptions can create database readiness failures even when the local process is healthy.

### 16.4 Production topology

A production environment should use separate stateless web/API services, a separately scaled worker, managed encrypted PostgreSQL, managed Redis, private object storage, secret management, private networking, health probes, backup, restoration, monitoring, and a one-off controlled schema job. A single free-tier all-in-one process is unsuitable for financial and academic records.[3]

### 16.5 Release gates

Before production, require locked installation, schema validation, type checks, tests, build, security checks, migration rehearsal on a clone, hermetic E2E, RLS role-isolation matrix, provider sandbox tests, backup/restore rehearsal, load/pool sizing, and institutional policy sign-off.[1]

---

## 17. Troubleshooting guide

### 17.1 “Cannot login”

Check that the web is on port 3000, the API is on port 3001, the API readiness endpoint is healthy, Redis is reachable, the account exists, the password is correct, MFA is available for the role, and the browser is not using a stale session. Do not repeatedly retry rapidly; authentication is rate-limited.

### 17.2 “Academic Life is empty”

An empty or unavailable journey can be caused by zero students, no curriculum version, no active academic plan, no course registration, no published result, no degree audit, RLS context failure, or a genuinely missing data relationship. Verify the authenticated role and student linkage first. If the database has no student/registration/result data, create valid records through admissions and student workflows before expecting a populated journey.

### 17.3 “Assessment or Results is broken”

Confirm that the API response matches the frontend contract, the selected offering exists, the user has lecturer or academic scope, and the offering is in an allowed lifecycle. If a response is shown as an object instead of an array, refresh the API/web build so the current typed response contract is deployed. Record the exact request path and response envelope for support.

### 17.4 “Readiness failed once”

A first readiness failure may reflect PostgreSQL cold-start latency or a transient network event. Retry after a short interval. If failures continue, inspect database URL reachability, Redis, connection limits, API logs, and the health response request ID.

### 17.5 “Port already in use”

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:3001 -sTCP:LISTEN
lsof -nP -iTCP:3002 -sTCP:LISTEN
```

Stop the existing process or use the already-running service. Do not start a second API or worker against the same port.

### 17.6 “Rate limited”

Wait for the rate-limit window to reset. Reduce repeated polling and avoid loops. For a legitimate high-volume integration, use an approved server-side process and request a documented limit review rather than disabling throttling.

### 17.7 “Forbidden” or missing menu item

Check effective role, effective staff scopes, department/faculty boundary, module flag, current lifecycle, and object ownership. Ask the administrator to review the assignment; do not edit browser storage or call an endpoint manually to bypass the restriction.

### 17.8 “Bulk PDF has missing photos/artwork”

Confirm the photo/artwork reference is an approved private storage key or allow-listed host, S3 credentials/bucket are configured, the object exists, the file is a valid supported image, and the API can access it. The renderer may safely fall back to the built-in design.

### 17.9 “Payment still pending”

Do not pay again immediately. Preserve the provider reference, check webhook/reconciliation status, contact the bursary, and allow the worker to process the event. A provider redirect is not proof that the local payment record is settled.

### 17.10 “Worker job failed or is in dead letter”

Read the failure reason, check whether a partial effect exists, confirm provider/database availability, fix the root cause, and replay only with authorization. For finance, privacy, admissions, or graduation jobs, require an owner review before replay.

### 17.11 “RLS context required”

This is a fail-closed signal that a sensitive query reached the database without the required request or trusted-system identity context. Do not bypass it by switching to a plain Prisma client. Inspect the API route, guard, service, transaction wrapper, and worker/system-operation path.

### 17.12 “Database sync proposes destructive changes”

Stop. Do not pass `--accept-data-loss`. Save the diff, compare it with the schema and retention decision, take an approved backup, and obtain database-owner review. This is especially important for role delegations, audit records, payments, results, identity cards, privacy records, and any `ON DELETE` behavior.

---

## 18. Operational checklists

### 18.1 Daily IT check

| Check         | Expected                                                      |
| ------------- | ------------------------------------------------------------- |
| Web           | HTTP 200 on the login page.                                   |
| API liveness  | HTTP 200 from `/api/health/live`.                             |
| API readiness | Database and Redis up.                                        |
| Worker        | Exactly the intended number of worker processes.              |
| Queue         | No unexplained growth or dead letters.                        |
| Database      | Connections healthy; no repeated RLS/transaction failures.    |
| Storage       | Required buckets reachable for enabled features.              |
| Logs          | No unexplained authentication, provider, or integrity errors. |

### 18.2 Registry daily check

Review admission-provider manual-review items, incomplete applications, accepted-but-not-matriculated applicants, registration exceptions, result approval queues, published-result anomalies, clearance blocks, and student-status transitions.

### 18.3 Bursary daily check

Review payment callbacks, pending reconciliation, failed provider jobs, invoice generation, waiver approvals, fee-clearance exceptions, duplicate-payment cases, and financial exports.

### 18.4 Exam-board checklist

Confirm timetable, venues, invigilators, candidate generation, attendance coverage, eligible mark entry, results assurance, finalization, approval state, amendments, withholds, and publication evidence.

### 18.5 Identity-card print checklist

Confirm the template, approved artwork, current branding, active-card selection, card expiry policy, photo quality, PDF count, A4 settings, front/back row alignment, plain-paper proof, cutting alignment, and audit export record.

### 18.6 Privacy/security checklist

Confirm least privilege, MFA, role/delegation expiry, unusual audit events, export records, security incidents, legal holds, backup status, restore evidence, key rotation status, and provider credential health.

---

## 19. API capability catalogue

All protected REST routes are under the API prefix `/api/v1` unless otherwise noted. Exact request schemas and role decorators are maintained in the controller and DTO source files and in the generated Swagger documentation at `/api/docs` when the API is running.

| API family             | Capability families                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth                   | Login, MFA verify/setup/confirm, backup-code verification, refresh, logout, revoke sessions, forgot/reset/change password, current user.                                             |
| Health                 | Liveness, readiness, detailed/integration health.                                                                                                                                    |
| Admissions             | Public references, drafts, submission, status tracking, applications, accessibility support, change requests, O’Level, eligibility, verification, JAMB, documents, screening.        |
| Academic               | Journey, degree audit, academic plans, history, appeals, transfers, interruption/deferment, progression.                                                                             |
| Students               | Matriculation, directory, list/detail, status, profile update, graduation eligibility/candidate/approval/completion, course registration/drop, registered courses, academic history. |
| Curriculum             | Faculties, departments, programmes, programme courses, courses, prerequisites, offerings, lifecycle, CCMA compliance.                                                                |
| Assessment             | Offerings, schemes, components, marks, gradebook, template/export, CSV upload, finalization, result generation.                                                                      |
| Results                | Single/bulk results, actions, bulk actions, amendments, withhold/release, course/semester reports, student result, transcript.                                                       |
| Exams                  | Semesters, current semester, timetable, candidate generation/list, attendance, exam marks, reports.                                                                                  |
| Fees                   | Schedules, invoices, student fees, waivers, waiver decisions, payment initiation/history, Paystack/Remita webhooks, TSA/manual payment.                                              |
| Clearance              | Items, create item, student checklist, clear/block/waive, pending list.                                                                                                              |
| Calendar               | Calendars, active/current, create, events, activate/suspend/resume/complete, event delete.                                                                                           |
| LMS                    | Content, publishing, courses, announcements, quiz questions/attempts/grading, attachments, submissions/grading, progress, discussions, LTI.                                          |
| Library                | Items, item detail, loans, return, renew, own loans, overdue.                                                                                                                        |
| Hostel                 | Blocks, rooms, allocations, vacate, own allocation.                                                                                                                                  |
| Clinic                 | Patients, appointments, records/history, drugs/low stock/stock, prescriptions.                                                                                                       |
| HR                     | Salary grades, staff, detail, retire, leave request/pending/decision.                                                                                                                |
| Payroll                | Runs, actions, payslips, staff payslips, IPPIS/PenCom exports.                                                                                                                       |
| Identity cards         | My card, public verification, register, issue, suspend/revoke, bulk PDF.                                                                                                             |
| Research               | Projects, people, members, grants, expenditures, outputs, summary reports.                                                                                                           |
| Alumni                 | Directory/profile, campaigns, donations, reports.                                                                                                                                    |
| Transport              | Vehicles, routes, trips, bookings, own bookings.                                                                                                                                     |
| Reports                | Generate, jobs/status/download, enrolment, revenue, CGPA, result statistics, dashboards.                                                                                             |
| Analytics/intelligence | Data quality, alerts/tasks, institution/department/audit summaries.                                                                                                                  |
| Search                 | Global, students, staff, courses, library.                                                                                                                                           |
| Policies               | Published/detail/acknowledge, policy CRUD/revisions/review/publish/archive/acknowledgements.                                                                                         |
| Privacy                | Subject access, Person intake, rectify, erase, export, restrict.                                                                                                                     |
| Security               | Incidents, list, contain, regulator-notified, resolve.                                                                                                                               |
| Users                  | User create/list/detail, access review, roles, delegations, remove role/delegation, activate/deactivate.                                                                             |
| Settings               | Branding, capabilities, full settings, feature flags.                                                                                                                                |
| Reliability            | Version, database, dead letters, replay.                                                                                                                                             |
| Audit viewer           | Filtered logs, summary, detail.                                                                                                                                                      |

The existence of an API route does not mean every user can call it. Controller roles, service rules, scope checks, object ownership, RLS, feature flags, and lifecycle state all remain relevant.

---

## 20. Implementation status and limitations

The current source includes substantial hardening, but the following items must remain visible to operators and decision-makers:

| Area              | Current position                                                                                                                |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Static validation | Strong source-level validation, type checks, lint, tests, build, security-pattern checks, and contract checks exist.            |
| Browser UAT       | Still required across Student, Lecturer/Staff, Registrar, HOD/Dean, Bursar, HR, DPO/Support, VC, and Super Admin journeys.      |
| PostgreSQL/RLS    | Live role-isolation and tenant/object boundary certification remain required.                                                   |
| Schema baseline   | Historical migration chain requires controlled schema handling and a future consolidated-baseline decision.                     |
| Providers         | JAMB/CAPS/WAEC, Paystack, Remita, SMTP/SMS, and S3 need real sandbox/pilot evidence.                                            |
| Finance           | Payment, reconciliation, refunds/ledger reversal, and adversarial concurrency need live evidence.                               |
| Academic          | Progression policy activation, exam-board moderation, published amendments, and full lifecycle E2E need institutional sign-off. |
| Infrastructure    | Backup/restore, DR, queue recovery, load/pool sizing, cloud deployment, and monitoring require rehearsal.                       |
| Data              | A populated student experience requires governed reference, student, curriculum, registration, result, and policy data.         |
| Frontend tests    | Meaningful browser/component coverage remains narrower than the source-level test suite.                                        |
| External artwork  | HTTPS artwork requires explicit host allow-listing; private storage keys are preferred.                                         |
| Identity cards    | Physical printer alignment and institutional design approval must be tested before production card stock.                       |
| Privacy           | Retention schedule, legal hold, pre-account applicant identity processing, and DPO approval remain institutional decisions.     |

The correct conclusion is **not** that UniPortal is unusable. The correct conclusion is that it is suitable for controlled development/staging and structured institutional rehearsal while the remaining live evidence and approvals are completed.

---

## 21. Glossary

| Term                         | Meaning                                                                                                            |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| ABAC                         | Attribute-Based Access Control; rules based on ownership, department, faculty, status, dates, or other attributes. |
| Academic offering            | A course instance offered in a particular academic period and section.                                             |
| Active student               | A student currently in the institution’s active status set, subject to the directory’s scope.                      |
| Advisory lock                | PostgreSQL coordination lock used to serialize concurrent business operations.                                     |
| Applicant                    | A person undergoing the admissions process before becoming a student.                                              |
| Assessment scheme            | Components, weights, and maximum scores used to build marks for an offering.                                       |
| BullMQ                       | Redis-backed queue framework used by the worker process.                                                           |
| Clearance                    | Institutional obligations that must be cleared, blocked, or waived for a transition.                               |
| Effective role               | A currently active primary or delegated role used for authorization presentation and evaluation.                   |
| Effective scope              | A currently active staff operational scope, possibly time- and department/faculty-bounded.                         |
| Idempotency                  | The property that repeating the same operation does not create duplicate business effects.                         |
| ID-1                         | ISO/IEC 7810 identification-card format used for bank-card/ATM-sized cards.                                        |
| Matriculation number         | The institutional student identifier issued during student creation/matriculation.                                 |
| NIN/BVN                      | Sensitive Nigerian identity/financial identifiers requiring strict handling.                                       |
| Outbox                       | Durable event record used to deliver asynchronous work after the business transaction.                             |
| RLS                          | PostgreSQL Row-Level Security.                                                                                     |
| Scope                        | A delegated operational boundary such as lecturer, records, health, or finance clerk.                              |
| Senate publication           | The governance state in which approved results become official/published.                                          |
| Soft delete/pseudonymization | Retaining historical identity/record continuity while removing or masking active personal data.                    |
| Student result               | A result record for a student/course/academic context, with controlled status and evidence.                        |
| Worker                       | The separate BullMQ processing runtime.                                                                            |

---

## 22. References

[1]: ../RELEASE_STATUS.md "UniPortal release status and remaining certification gates"
[2]: ../README.md "UniPortal repository overview, architecture, commands, and security baseline"
[3]: DEPLOYMENT_GUIDE_HARDENED.md "Hardened deployment, runtime split, policies, and release gates"
[4]: architecture.md "Academic integrity, RLS boundary, result lifecycle, and academic history"
[5]: DEPLOYMENT_GUIDE_HARDENED.md#public-admissions-tracking "Public admissions tracking credential requirements"
[6]: identity-cards-and-identifiers.md "Configurable matriculation, identity-card templates, and bulk PDF printing"
[7]: https://www.iso.org/standard/70486.html "ISO/IEC 7810:2019 — Identification cards: Physical characteristics"
[8]: ../MACBOOK_LOCALHOST_QUICKSTART.md "Low-resource MacBook localhost operation"
[9]: https://owasp.org/www-project-top-ten/ "OWASP Top 10 web-application security risks"
[10]: https://www.ndpc.gov.ng/ "Nigeria Data Protection Commission"

The manual uses the current repository source as the primary implementation authority. External references [7], [9], and [10] provide standards or institutional security/privacy context; they do not constitute a claim that UniPortal is independently certified against those standards.
