# UniPortal ERP V38 Enhancement Changelog

**Implementation date:** 15 August 2026  
**Base:** V37 deep-audit remediation  
**Scope:** Backend invariants, frontend workflow exposure, shared contracts, LMS authorization, provider readiness, and regression assurance.

## Executive summary

V38 applies the highest-impact actionable recommendations from the V37 module-maturity audit. The release preserves the existing NestJS, Prisma, BullMQ, Next.js, React Query, and shared-type architecture while expanding previously read-only or backend-only workflows. It adds operational actions, new management workspaces, enrolment-aware LMS access, correct student identity propagation, production integration-readiness reporting, and direct regression tests for newly hardened boundaries.

The release is **type-safe, buildable, lint-clean, and verification-clean** under the repository’s available checks. It does not fabricate external provider certification: JAMB, WAEC, Paystack, and Remita still require institution credentials, provider agreements, live webhook verification, and deployment-environment certification before go-live.

## Implemented changes

### 1. Hostel allocation integrity and concurrency

`apps/api/src/modules/hostel/hostel.service.ts` now locks and re-reads the room row inside the allocation transaction using `SELECT ... FOR UPDATE`. Capacity, room activity, student gender compatibility, and duplicate academic-year allocation are revalidated under the same transaction. This prevents concurrent requests from oversubscribing rooms after both callers observe stale capacity.

Vacating a room now locks the room, performs a guarded decrement, and refuses to complete if occupancy is already inconsistent or zero. The allocation state transition and occupancy update are atomic.

### 2. Smart Operations became an actionable human-in-the-loop workflow

`apps/api/src/intelligence/intelligence.service.ts` now supports alert acknowledgement, resolution, and dismissal; task claiming; privileged task assignment; and validated task status transitions. Actions are authorization-aware, idempotent where appropriate, protected against competing claims, and recorded in `audit_logs`.

`apps/api/src/intelligence/intelligence.controller.ts` exposes the new routes with UUID parsing, role restrictions, and DTO validation. `apps/api/src/intelligence/intelligence.dto.ts` defines task assignment and status contracts.

`apps/web/hooks/use-intelligence.ts` provides typed React Query mutations and cache invalidation. `apps/web/app/dashboard/smart-operations/page.tsx` now supports alert actions, task filtering, claiming, starting, and completion instead of only rendering read-only cards.

### 3. Assessment workspace

`apps/web/hooks/use-assessment.ts` and `apps/web/app/dashboard/assessment/page.tsx` add a gradebook workspace for active-scheme inspection, completeness metrics, draft-result generation, and CSV export. Draft results cannot be generated from the UI while marks are incomplete.

### 4. Examination workspace

`apps/web/app/dashboard/exams/page.tsx` adds semester timetable discovery, candidate generation, candidate visibility, and attendance-gap reporting. It surfaces operational exam readiness without bypassing the existing API authorization rules.

### 5. Clearance workspace

`apps/web/hooks/use-clearance.ts` and `apps/web/app/dashboard/clearance/page.tsx` add student self-service and operator lookup. Authorized staff can clear or block checklist items, while VC/SUPER_ADMIN users can waive blocked items with a required reason.

### 6. Security-incident workspace

`apps/web/hooks/use-security-incidents.ts` and `apps/web/app/dashboard/security-incidents/page.tsx` expose incident reporting, containment, confirmation of the out-of-band regulatory filing, and DPO-noted resolution. The UI makes the human responsibility of the NITDA workflow explicit.

### 7. Privacy-operations workspace

`apps/web/app/dashboard/privacy/page.tsx` exposes access requests, portability export, rectification, processing restriction, and controlled super-admin erasure. Erasure requires a distinct VC UUID and explicit confirmation in the UI. The API client now supports DELETE request bodies for this contract.

### 8. User administration workspace

`apps/web/hooks/use-users-admin.ts` and `apps/web/app/dashboard/users/page.tsx` add super-admin account creation, activation/deactivation, role grants, and role revocation. The page uses the existing server-side role-cap and audit controls rather than reproducing authorization in the browser.

### 9. Student identity contract correction

`packages/types/src/auth.types.ts` now includes optional `UserV1.studentId`. `AuthService` includes the linked Student UUID in login, refresh, and current-user responses. Student-facing results, fees, students, clearance, and privacy pages now use the resolved Student.id rather than incorrectly assuming that User.id and Student.id are the same UUID.

This closes a cross-layer identity mismatch documented in the JWT contract and prevents student self-service requests from targeting the wrong record.

### 10. LMS enrolment boundaries and discovery

`apps/api/src/modules/lms/lms.service.ts` now enforces registration checks before a student can read course content or announcements. It also provides enrolment-aware course discovery through `getStudentCourseOfferings()`.

`apps/api/src/modules/lms/lms.controller.ts` adds `GET /lms/my-courses` and passes the authenticated student identity into content and announcement authorization. `apps/web/app/dashboard/lms/page.tsx` now offers students a selector populated from their registered courses while preserving manual scoped lookup for staff.

### 11. Provider and admissions readiness visibility

`apps/api/src/health/health.controller.ts` adds privileged `GET /health/integrations`. It reports configuration completeness for Paystack, Remita, JAMB, and WAEC without exposing secrets. Remita status verification is reported separately from basic configuration, and the response explicitly states that provider certification remains a deployment gate.

This makes external readiness observable without falsely treating configured environment variables as completed provider integration.

### 12. Shared privacy/security contracts

`packages/types/src/p10.types.ts` now documents VC approval as a UUID-based approval identity and includes the derived `overdue` field returned by the security-incident list workflow.

### 13. Regression assurance

New direct tests were added for:

| Area | File | Coverage |
|---|---|---|
| Hostel | `apps/api/src/modules/hostel/hostel.service.spec.ts` | Locked allocation, capacity enforcement, gender policy, duplicate protection, guarded vacancy |
| Smart Operations | `apps/api/src/intelligence/intelligence.service.spec.ts` | Alert authorization/lifecycle, atomic task claims, transition rules |
| LMS | `apps/api/src/modules/lms/lms.service.spec.ts` | Enrolment gating and course discovery |

## Verification results

The final deep-verification run completed with all repository checks passing:

| Check | Result |
|---|---:|
| Dependency installation | PASS |
| Prisma generation | PASS |
| Prisma validation | PASS |
| Monorepo type-check | PASS — 9/9 packages |
| Production build | PASS — 5/5 build tasks |
| Lint | PASS — 5/5 lint tasks |
| Serial API and utility tests | PASS — 25 API suites / 365 API tests; 5 utility suites / 36 utility tests |
| P1 integrity checks | PASS |
| P2 operational checks | PASS |
| P4 rule checks | PASS |
| P5 static security audit | PASS |
| P5 contract audit | PASS |
| P5 integration audit | PASS |
| Route contract audit | PASS — 13 tests |

## Remaining external or environment-dependent gates

The following items cannot be truthfully completed inside the repository without institution-specific external access:

1. JAMB and WAEC provider calls require approved institutional agreements, credentials, endpoint contracts, and provider certification. Until then, the system correctly keeps manual verification as the explicit fallback.
2. Paystack and Remita require live merchant credentials, webhook secrets, callback testing, settlement reconciliation, and provider certification. Configuration-readiness reporting is now available, but configuration is not certification.
3. Docker-dependent hermetic E2E certification remains environment-dependent if Docker is unavailable in the execution sandbox. The source-level, route, contract, unit, build, lint, schema, and static checks are complete.

## Release assessment

V38 materially improves the previous maturity gaps. Assessment, exams, clearance, privacy, security incidents, users, and Smart Operations now have first-class frontend workflow surfaces. Hostel allocation is transaction-safe, LMS access is enrolment-aware, student identity is consistently propagated, and provider readiness is observable.

The remaining work is concentrated in **external-provider certification** and deeper product expansion such as full LMS submissions/grading/discussions, richer timetable authoring, and advanced operational analytics. Those are product-roadmap extensions rather than hidden cross-layer inconsistencies or unprotected backend routes.

## References

[1]: MODULE_MATURITY_AUDIT_V37.md "UniPortal ERP V37 module maturity audit"
[2]: IMPLEMENTATION_CHANGELOG_V37.md "UniPortal ERP V37 deep-audit remediation changelog"
[3]: apps/api/src/modules/hostel/hostel.service.ts "Hostel allocation service"
[4]: apps/api/src/intelligence/intelligence.service.ts "Smart Operations service"
[5]: apps/api/src/modules/lms/lms.service.ts "LMS service"
[6]: apps/api/src/health/health.controller.ts "Integration readiness endpoint"
[7]: packages/types/src/auth.types.ts "Shared authentication and student identity contract"
