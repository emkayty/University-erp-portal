# UniPortal ERP V37 — Module Maturity Audit

**Assessment date:** 15 August 2026  
**Scope:** API modules, frontend workspaces, shared client/hooks, Prisma data model, cross-module wiring, tests, and known integration boundaries.

## Executive conclusion

> **No—not every module is yet properly and richly developed across the full stack.**

The system is substantially more than a scaffold. Its identity, admissions, student lifecycle, curriculum, fees, reporting, results, clinic, policy, HR/payroll, and several operational domains contain meaningful business logic, authorization, validation, persistence, and automated coverage. The V37 source tree compiles, builds, lints, and passes the available automated suite, including **353 API tests and 36 utility tests**.

However, the standard of “richly developed” is higher than “has routes and compiles.” Maturity is uneven. Several backend domains have no dedicated frontend workspace or no direct unit tests; some frontend pages expose only a read-only slice of a considerably larger backend; the intelligence/smart-operations surface is currently read-only; the LMS is a content-and-announcement subset rather than a complete learning platform; and payment/admissions provider integrations remain explicitly dependent on external credentials or agreements. The correct overall classification is therefore **strong core ERP with several partial and unevenly productized modules**, not “every module complete.”

## Assessment method

The assessment used source-level inventory and cross-layer tracing rather than line count alone. For each domain, the review compared controller routes, service logic, Prisma models, DTOs, queues/processors, frontend pages, React Query hooks or direct API calls, role/scoping enforcement, and direct test files. File size is used only as a signal; a small specialized module can be complete, while a large module can still omit critical workflows.

The repository contains **29 API module directories**, approximately **130 Prisma models**, **37 frontend route pages**, and **19 reusable feature hooks**. Direct unit coverage is uneven: **12 API modules have no module-specific `.spec.ts` file**, although some are indirectly covered by route or integration checks.

## Module-by-module maturity matrix

| Module | Backend maturity | Frontend exposure | Automated coverage | Assessment |
|---|---|---|---|---|
| **Auth** | **Strong** — login, MFA, backup codes, refresh rotation, sessions, password reset/change, revocation, mandatory-MFA handling | **Strong** — login, reset, auth store, redirect/session handling | Direct auth spec plus cross-layer checks | One of the most mature domains. Remaining readiness depends on production key/Redis configuration and operational runbooks rather than missing core flows. |
| **Users** | **Moderate** — user creation, listing, lookup, role grant/revoke, activation | **Weak/indirect** — no dedicated user-administration workspace or reusable user hook identified | No direct module spec | Functionally present for administrators but not richly productized. Needs a complete user/role/scope management UI and focused tests. |
| **Students** | **Strong** — matriculation, search/list/detail, status, graduation, course registration/drop, academic history, clearance-related actions | **Strong** — student workspace with reusable hooks and mutations | Direct service spec | Mature core lifecycle domain; should be extended with deeper bulk operations, import/export, and end-to-end workflow tests. |
| **Admissions** | **Strong but integration-dependent** — cycles, public references, applications, documents, O-Level eligibility, screening, decisions, offers/status tracking | **Strong** — application form, status tracking, staff admissions workspace | Direct service spec and contract coverage | Rich functional coverage. JAMB and WAEC calls are explicitly TODO pending external agreements/credentials, so external verification is not production-complete. |
| **Curriculum** | **Strong** — faculties, departments, programmes, courses, prerequisites, offerings, CCMAS compliance | **Strong** — hierarchical management workspace and hooks | Direct service spec | Strongly wired and reasonably rich. Needs deeper authorization/scoping and end-to-end curriculum-to-registration verification. |
| **Academic** | **Strong backend** — journey, degree audit, progression, placements, appeals, transfers, interruptions, credentials | **Partial** — the page primarily renders `/academic/me/journey`; most administrative actions are not exposed in a dedicated workspace | Direct service spec | Backend is substantially richer than the UI. Degree-audit/progression actions, appeals, transfer, interruption, and credential workflows need explicit frontend surfaces. |
| **Assessment** | **Strong core engine** — schemes, weighted components, finalization, marks, gradebook, CSV template/upload, draft result generation | **Weak** — no dedicated assessment page or reusable assessment hook identified | No direct module spec | Important backend capability is effectively hidden from the product UI. This is a major completeness gap because assessment is a primary academic workflow. |
| **Exams** | **Moderate** — semesters, timetables, candidates, attendance, reports | **Weak/partial** — some attendance is reached through results hooks, but there is no dedicated exam operations workspace | Direct service spec | The backend covers the basic operational model, but timetable generation, candidate management, invigilation, venue control, and attendance operations are not richly exposed. |
| **Results** | **Strong** — submission, bulk actions, approval workflow, amendment, withholding/release, reports, transcript | **Strong** — student results/transcript and result-action flows | Direct service spec and route contracts | One of the stronger end-to-end domains. Needs additional browser-level workflow coverage and more visible senate/publication lifecycle UX. |
| **Fees and payments** | **Strong core with readiness gaps** — schedules, invoices, waivers, clearance recomputation, payment initiation/history, webhooks, reconciliation processors | **Strong** — schedules, invoices, payment, waivers, and history are exposed | Two direct service specs plus contract checks | Business logic is rich and V37 hardened concurrency/idempotency. Exact Paystack/Remita verification and production credential paths remain explicitly pre-go-live work. |
| **Reports** | **Strong** — authorization policy, asynchronous jobs, XLSX/CSV artifacts, storage, analytics, custom privacy exports, scoping | **Strong** — report generation, job tracking, downloads, analytics dashboards | Direct artifact spec plus route/contracts | Strong cross-layer domain. Should add more report-specific authorization tests and browser tests for downloads, job failure, and large-result behavior. |
| **Clinic** | **Strong** — patients, appointments, encrypted medical records, drugs, stock, prescriptions, history | **Strong** — clinic operations page with appointment, record, inventory actions | No direct module spec | Substantive and sensitive domain, but absence of direct unit tests is a serious assurance gap. Needs strict clinical-role, audit, and privacy integration tests. |
| **Library** | **Moderate/strong** — items, search, loans, return, renewal, overdue | **Strong** — search, borrowing, return, renewal, personal loans | Direct service spec | Coherent operational module. A richer version would add reservations, fines, catalog import, circulation reporting, and librarian workflows. |
| **Hostel** | **Basic/partial** — blocks, rooms, allocation, vacancy, gender and occupancy checks | **Weak/partial** — student block/allocation view; management operations are not exposed despite manager roles | No direct module spec | Not richly developed. It lacks a full allocation-management UI and has a concurrency risk: capacity is checked before the transaction and the room row is not explicitly locked before incrementing occupancy. |
| **Transport** | **Moderate** — vehicles, routes, trips, statuses, bookings, cancellation | **Strong** — trips, routes, vehicles, booking and cancellation hooks | No direct module spec | Good basic operational slice, but missing richer route planning, seat/capacity enforcement evidence, driver assignment, maintenance, manifests, and reports. |
| **HR** | **Moderate/strong** — salary grades, staff, retirement, leave requests and decisions | **Strong** — staff, grades, leave decision workspace | Direct service spec | Useful first operational release. Needs richer employee records, recruitment, attendance, benefits, disciplinary workflows, and audit/reporting coverage. |
| **Payroll** | **Moderate/strong** — payroll runs, actions, payslips, IPPIS/PENCOM exports | **Strong** — run creation/actions and payslip views | Direct service spec | Reasonably developed, but statutory rules, approvals, reversals, reconciliation, and provider/export validation need broader scenario coverage. |
| **LMS** | **Basic/partial** — content, publish, announcements, LTI configuration | **Partial** — direct API calls for content and announcements, usually driven by manually entered offering IDs | No direct module spec | Not a full LMS. Missing enrolment-aware discovery, lessons/modules, submissions, assessments, grading, discussions, progress, and instructor/student course context. |
| **Notifications** | **Strong backend worker** — event routing, email/SMS/in-app delivery preparation, retries and provider configuration | **Basic** — inbox list and mark-read only | No direct module spec | The delivery engine is richer than the HTTP/UI surface. Missing preferences, channel controls, templates administration, bulk/read-all, filtering, notification center state, and direct tests. |
| **Calendar** | **Moderate** — academic calendars, lifecycle transitions, events | **Strong** — calendar management and event actions | Direct service spec | Well wired for the current scope. Needs richer recurrence, conflict detection, audience targeting, reminders, and calendar feeds. |
| **Research** | **Moderate** — projects, members, grants, expenditures, outputs, summary | **Strong** — research workspace and mutations | No direct module spec | Good initial research administration slice. Needs ethics workflow, grant lifecycle, budgets, approvals, reporting, and stronger authorization/tests. |
| **Alumni** | **Moderate** — profiles, directory, campaigns, donations, donation status, reports | **Strong** — profile, campaign, and donation flows | No direct module spec | Good functional breadth for an initial release. Needs payment reconciliation, receipts, campaign segmentation, communications, and donor privacy controls. |
| **Policies** | **Strong** — policy CRUD, revisions, submit/review/publish/archive, acknowledgements | **Strong** — search, lifecycle, acknowledgement and detail flows | Direct service spec | One of the better governance modules. Needs version-diff UX, escalation/reminders, policy analytics, and broader lifecycle browser tests. |
| **Settings** | **Moderate** — institutional settings and feature flags | **Strong** — settings workspace with update/toggle controls | No direct module spec | Functional but sensitive. Needs configuration audit history, typed feature-flag registry, validation previews, and rollback/versioning. |
| **Privacy** | **Strong compliance core** — SAR, rectification, erasure/legal hold, portability, restriction, queues and audit evidence | **Weak** — no dedicated privacy-rights workspace identified | Direct service spec | Backend is thoughtfully developed, but DPO/VC operations are not richly surfaced to authorized users in the frontend. |
| **Security incidents** | **Moderate/strong** — incident creation, listing, containment, notification, resolution, deadline logic | **Weak** — no dedicated incident-management workspace identified | Direct service spec | Backend is credible; UI and operational dashboards are missing. Needs evidence attachments, incident timeline, severity workflow, notifications, and reporting. |
| **Search** | **Moderate and coherent** — global and domain searches for students, staff, courses, and library | **Strong utility** — global search integration | No direct module spec | Appropriate narrow utility, not intended to be a full domain. Needs indexing/relevance/performance tests and permission-aware search verification. |
| **Audit viewer** | **Coherent specialized module** — paginated audit logs, detail view, 30-day summary | **Moderate** — audit-log page exists | No direct module spec | Narrowness is intentional and acceptable, but it needs direct tests because it is a security-critical read surface. |
| **Clearance** | **Moderate** — items, student status, clear/block/waive, pending queue | **Weak** — no dedicated clearance workspace or hook identified | Direct service spec | Backend workflow exists but is not richly accessible. Needs student-facing status, departmental queues, evidence, escalation, and cross-module fee/library/hostel integration UI. |

## Cross-layer findings

### The core ERP spine is strong

The strongest end-to-end chain is **admissions → matriculation → curriculum/programme/course offerings → registration → assessment/results → fees/clearance → reports/transcripts**. These domains have the most substantial services, real persistence, validation, authorization, queue or workflow logic, frontend hooks, and direct tests. V37’s fixes materially improve this spine through report scoping, fee-waiver transaction safety, invoice idempotency, response envelopes, and privacy export completeness.

### Frontend productization is behind backend breadth

A recurring pattern is that the backend exposes materially more functionality than the frontend. The most important examples are assessment, exams, clearance, privacy, security incidents, users, and academic administration. A route existing in a controller does not mean the institutional workflow is usable by its intended operator. These domains need dedicated workspaces, role-aware forms, loading/error/empty states, mutation invalidation, and browser-level acceptance tests.

The frontend is not generally static: most major pages use React Query hooks or direct API calls, and the build succeeds. Nevertheless, some pages are primarily launchers or read-only summaries. The Enterprise Operations page is a navigation layer rather than a domain module, and Smart Operations currently lists alerts/tasks without claim, assignment, closure, escalation, or workflow actions.

### Backend richness does not eliminate production-readiness gaps

The admissions and payments domains are structurally rich but still depend on external operational completion. Admissions processors explicitly retain JAMB and WAEC integration TODOs pending agreements. Fees/payment code documents provider verification and credential work that must be completed with live Paystack/Remita credentials and webhook configuration. These should be treated as go-live gates, not merely future enhancement ideas.

### Assurance coverage is uneven

The available suite is healthy overall, but twelve API modules have no direct module-specific unit spec: **alumni, assessment, audit-viewer, clinic, hostel, LMS, notifications, research, search, settings, transport, and users**. Some are covered indirectly, but the absence is material for sensitive areas such as clinic, users, notifications, hostel allocation, and assessment. Direct tests should cover authorization, transaction boundaries, validation, race-sensitive invariants, and representative Prisma failures.

## Highest-priority gaps

| Priority | Gap | Why it matters | Recommended completion |
|---|---|---|---|
| **P0** | Complete frontend surfaces for assessment, exams, clearance, privacy, security incidents, and user administration | Operators cannot reliably execute or monitor several backend workflows through the product | Add dedicated pages, typed hooks, role-aware actions, error/empty states, and browser acceptance tests. |
| **P0** | Finish payment provider verification and admissions examination-authority integrations | Financial settlement and admissions eligibility are not production-complete without real provider paths | Implement and certify Paystack/Remita verification, webhook replay/idempotency, JAMB/WAEC adapters, credential rotation, and contract tests. |
| **P1** | Fix hostel allocation concurrency | Concurrent allocations can oversubscribe a room if capacity is checked before a locked transaction | Lock the room row inside the transaction, re-read occupancy, enforce capacity, and add a concurrent-allocation integration test. |
| **P1** | Expand LMS beyond content/announcements | Current functionality does not support the principal learning lifecycle | Add enrolment-aware course views, modules/lessons, submissions, grading, progress, discussion, and instructor/student permissions. |
| **P1** | Turn Smart Operations into an actionable workflow | Read-only alerts/tasks do not close the operational loop | Add task claim, assignment, priority, status transitions, comments/evidence, escalation, SLA tracking, and audit events. |
| **P1** | Add direct test coverage to the twelve uncovered modules | Important business and privacy/security paths can regress silently | Add service specs and selected integration tests, prioritizing clinic, assessment, hostel, notifications, users, and security-facing modules. |
| **P2** | Increase frontend type safety and shared contracts | Several pages use `any` and manually shaped responses, increasing drift risk | Generate or centralize DTO/result types, remove `any` from high-risk pages, and add contract tests for every hook. |
| **P2** | Enrich operational reporting and administration | Basic CRUD works but does not fully support institutional governance | Add bulk operations, exports, dashboards, audit trails, reminders, reconciliation, and lifecycle analytics domain by domain. |

## Final verdict

The project is **architecturally substantial and operationally credible in its core ERP spine**, and V37 is not a superficial scaffold. It is also **not accurate to say that every module is fully, richly, and evenly developed**. The main deficiency is not absence of backend code; it is uneven completion across the three dimensions that matter in production: **backend business depth, frontend workflow exposure, and independent assurance coverage**.

A reasonable release classification is:

> **Core ERP: strong and test-verified. Extended modules: functional but uneven. Full institutional product maturity: not yet achieved.**

## References

[1]: COMPREHENSIVE_ARCHITECTURE_AUDIT.md "UniPortal ERP comprehensive architecture audit"
[2]: IMPLEMENTATION_CHANGELOG_V37.md "V37 implementation changelog"
[3]: apps/api/src/modules/assessment/assessment.service.ts "Assessment business service"
[4]: apps/api/src/modules/hostel/hostel.service.ts "Hostel allocation service"
[5]: apps/web/app/dashboard/academic/page.tsx "Academic journey frontend page"
[6]: apps/web/app/dashboard/enterprise/page.tsx "Enterprise Operations launcher page"
[7]: apps/web/app/dashboard/smart-operations/page.tsx "Smart Operations frontend page"
[8]: apps/api/src/modules/lms/lms.service.ts "LMS business service"
[9]: apps/api/src/intelligence/intelligence.service.ts "Intelligence and operational-signals service"
[10]: apps/api/src/modules/notifications/notifications.processor.ts "Notification delivery processor"
[11]: apps/api/src/modules/admissions/jobs/admissions-ops.processor.ts "Admissions external-integration processor"
[12]: apps/api/src/modules/fees/payments.service.ts "Payment service and provider readiness boundaries"
