# UniPortal v43.14 Important Page Visual Reference Catalog

## Purpose and non-negotiable fidelity rules

This catalog defines the pages included in the page-level visual alignment and reference-mockup pass. The visual work changes hierarchy, spacing, surfaces, responsive layout, and status visibility only. It does **not** add a workflow, remove a workflow, bypass authorization, change an API contract, change a field requirement, create production mock data, or alter backend enforcement. The application remains the source of truth; reference images are illustrative renderings of the current page structure and existing feature vocabulary.

Every selected route has a desktop and mobile reference. Illustrative values in the reference images are clearly marked as such and are not inserted into production code or database records.

## Visual system applied

The aligned pages use the existing UniPortal tokens: primary blue `#0056B3`, primary dark `#003D80`, institutional navy surface `#062B5C`, light desktop canvas, restrained glass accents, high-contrast status states, compact control rails, readable dense data surfaces, and stacked mobile cards. Existing role and scope filtering remains authoritative in the page and API layers.

## Primary strategic pages

| Route | Current source | Existing role/workflow scope | Desktop + mobile reference intent |
|---|---|---|---|
| `/apply` | `apps/web/app/apply/page.tsx` | Public admission application: draft/resume, programme and applicant details, JAMB/O-Level, guardian/sponsor, support, photo, review, consent, Turnstile, receipt and tracking states | Public branded admission shell, progress rail, draft rail, grouped form surface and responsive field stacking |
| `/apply/status` | `apps/web/apply/status/page.tsx` | Public application tracking and receipt/status lookup | Public status lookup and outcome states; no dashboard navigation |
| `/dashboard` | `apps/web/app/dashboard/page.tsx` | Role-specific command centre, metrics, attention queues, workspaces, actions, freshness and customization | Approved navy/light command-centre shell for student, lecturer/staff and administrator states |
| `/dashboard/academic` | `apps/web/app/dashboard/academic/page.tsx` | Student academic journey, readiness, next legitimate actions, degree audit, plan, courses, history and requests | Student journey workspace with clear state hierarchy and mobile cards |
| `/dashboard/assessment` | `apps/web/app/dashboard/assessment/page.tsx` | Lecturer/HOD/Dean/Registrar/Super Admin assessment scheme, bulk CSV validation/apply, autosave live grading, assurance and result generation | Live grading command surface with offering control, autosave/audit status, cohort snapshot, assurance and gradebook |
| `/dashboard/results` | `apps/web/app/dashboard/results/page.tsx` | Student result/transcript view; lecturer entry; governed HOD/Dean/Registrar review, approval, amendment, withhold/release and publication | Results/transcript and moderation states with compact filters, status signals and responsive tables/cards |
| `/dashboard/analytics` | `apps/web/app/dashboard/analytics/page.tsx` | VC/Super Admin institution overview, HOD department dashboard, audit summary and data quality | Decision workspace with role-filtered tabs, KPI tiles, freshness and data-quality surfaces |

## High-value operational pages

| Route | Current source | Existing role/workflow scope | Desktop + mobile reference intent |
|---|---|---|---|
| `/dashboard/admissions` | `apps/web/app/dashboard/admissions/page.tsx` | Admissions cycles, applications, filters, document/O-Level/JAMB verification, accessibility, corrections, screening and decisions | Admissions operations header, role-filtered tabs, application queue and detail surfaces |
| `/dashboard/students` | `apps/web/app/dashboard/students/page.tsx` | Student self-view; staff directory; student records, profile, matriculation, lifecycle and graduation controls | Academic-records workspace with visible role-filtered tabs and data/profile cards |
| `/dashboard/course-offerings` | `apps/web/app/dashboard/course-offerings/page.tsx` | Create offering, assign lecturer, filter and move offering lifecycle | Academic operations header, creation rail and offering cards/lifecycle controls |
| `/dashboard/fees` | `apps/web/app/dashboard/fees/page.tsx` | Student fees/payment; schedules, invoices, provider initiation, waivers and finance actions | Finance control rail, invoice/payment surfaces and mobile action stacking |
| `/dashboard/exams` | `apps/web/app/dashboard/exams/page.tsx` | Timetable authoring/rescheduling, candidate generation, attendance and reports | Examination operations control, timetable list, report metrics and candidate actions |
| `/dashboard/identity-cards` | `apps/web/app/dashboard/identity-cards/page.tsx` | Digital card, issue/replace, register, lifecycle, verification, print and selected active-card bulk PDF | Identity credential surface and administrative register with print/bulk-PDF controls |

## Supporting compact pages

These routes remain in the catalog because they contain a substantial existing workflow or are important for a complete institutional visual language. They use the same shell and responsive rules, but do not receive invented dashboard panels.

| Route family | Current source examples | Existing functionality represented |
|---|---|---|
| Academic structure | `/dashboard/curriculum`, `/dashboard/calendar`, `/dashboard/lms`, `/dashboard/library` | Curriculum/version control, calendar, learning and library workflows already present in code |
| Student services | `/dashboard/clearance`, `/dashboard/hostel`, `/dashboard/clinic`, `/dashboard/transport`, `/dashboard/notifications` | Clearance, accommodation, health, transport and notification states already exposed by current pages |
| Governance and reliability | `/dashboard/users`, `/dashboard/settings`, `/dashboard/audit`, `/dashboard/reliability`, `/dashboard/privacy`, `/dashboard/security`, `/dashboard/policies`, `/dashboard/smart-operations`, `/dashboard/enterprise` | Role/ABAC governance, audit, reliability, privacy, security, policy and operational controls |
| Institutional operations | `/dashboard/hr`, `/dashboard/payroll`, `/dashboard/reports`, `/dashboard/research`, `/dashboard/alumni` | Existing HR/payroll, reporting, research and alumni/endowment workflows |

## Role and data-state fidelity

The reference set uses only labels, controls and states present in the current source. A control is shown only where the current page can render it for the corresponding role or scope. Student, lecturer, staff, HOD, Dean, Registrar, Bursar, VC and Super Admin references are separate role states where their existing source code provides materially different navigation or controls.

Empty, loading, error, unauthorized and success states are included where they are meaningful to the page. A reference image showing a populated list is a visual demonstration of the existing list/table/card shape; it is not evidence that the connected development database contains those records.

## Validation record

The page-level visual classes were introduced through the shared global stylesheet and applied to the priority routes above. Focused web type-check and lint passed after the alignment pass. Full monorepo regression and browser/UAT verification remain required before treating the visual pass as release-ready, particularly against a connected staging dataset with role-specific accounts.
