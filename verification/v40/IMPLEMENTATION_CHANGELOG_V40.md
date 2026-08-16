# UniPortal ERP V40 Enhancement Changelog

**Implementation date:** 15 August 2026  
**Base:** V39 enhanced release  
**Scope:** Examination timetable authoring, safe rescheduling and cancellation, operational frontend controls, and assurance coverage for thin transport and research modules.

## Executive summary

V40 completes the principal examination-operations gap identified in the module maturity audit. Authorized registrar, HOD, and super-administrator users can now author timetable entries, reschedule them through full clash and capacity revalidation, and cancel only examinations that have not yet generated candidates or attendance records. The examinations workspace now exposes those lifecycle controls directly.

V40 also adds direct assurance coverage for transport booking and research governance boundaries, including vehicle availability, vehicle double-booking, atomic seat decrement, duplicate booking prevention, ownership controls, ethics gating, duplicate membership prevention, and grant-budget protection.

## Implemented changes

### 1. Exam timetable update and cancellation DTOs

`apps/api/src/modules/exams/dto/exams.dto.ts` now defines `UpdateExamTimetableDto` with optional, validated venue, date, start time, duration, and invigilator-note fields. Validation preserves the existing bounds for UUIDs, ISO dates, HH:MM time values, and 30–360-minute examination durations.

### 2. Clash-safe timetable rescheduling

`apps/api/src/modules/exams/exams.service.ts` now provides `updateTimetableEntry()`.

The operation revalidates the official semester examination window, managed venue existence and active state, 24-hour time bounds, venue overlap excluding the current row, venue capacity against registered candidates, and overlapping registered students across other examinations on the same date. It records old and new timetable values in the audit log after the update.

The implementation intentionally does not trust the prior timetable validation result. Every reschedule is treated as a new scheduling decision and is rechecked against current registrations, venue state, and competing examinations.

### 3. Guarded timetable cancellation

`cancelTimetableEntry()` now prevents cancellation when generated candidates or attendance records exist. This protects downstream examination evidence from being silently deleted. Unused timetable entries can be cancelled by authorized operators, and the deletion is audited.

### 4. Examination controller routes

`apps/api/src/modules/exams/exams.controller.ts` now exposes:

| Route | Purpose |
|---|---|
| `PATCH /exams/timetable/:id` | Reschedule an examination with full validation. |
| `DELETE /exams/timetable/:id` | Cancel only an examination with no candidates or attendance records. |

Both routes are restricted to `REGISTRAR`, `HOD`, and `SUPER_ADMIN` roles and retain the existing bearer-authentication, role-guard, UUID parsing, and response-envelope conventions.

### 5. Examination frontend workspace

`apps/web/app/dashboard/exams/page.tsx` was expanded into an operational timetable workspace. Authorized operators can now:

1. Create a timetable entry for the active semester using course-offering and venue UUIDs.
2. Edit an existing entry through a rescheduling form.
3. Cancel an unused entry after an explicit confirmation step.
4. Continue generating candidates and recording attendance.
5. View candidate totals, eligible candidates, attendance records, present count, coverage percentage, and missing attendance.

The frontend invalidates timetable, candidate, and report queries after mutations so the operational view stays synchronized with the backend state.

### 6. Transport assurance coverage

`apps/api/src/modules/transport/transport.service.spec.ts` adds direct tests for:

| Boundary | Assurance |
|---|---|
| Vehicle status | Trips cannot be created with unavailable vehicles. |
| Vehicle scheduling | A vehicle cannot be assigned to overlapping scheduled trips within the safety buffer. |
| Seat booking | Booking uses a positive-seat atomic decrement before confirmation. |
| Duplicate booking | A user cannot hold two confirmed bookings for one trip. |
| Booking ownership | A user cannot cancel another user’s booking. |

### 7. Research assurance coverage

`apps/api/src/modules/research/research.service.spec.ts` adds direct tests for:

| Boundary | Assurance |
|---|---|
| Project ownership | Only the lead researcher can edit project details. |
| Ethics governance | A project cannot be activated without an ethics approval reference. |
| Membership lifecycle | Duplicate project members are rejected. |
| Grant control | Expenditure that exceeds the locked grant budget is rejected before writing. |

## Verification results

The final V40 deep-verification run completed successfully:

| Check | Result |
|---|---:|
| Dependency installation | PASS |
| Prisma generation | PASS |
| Prisma validation | PASS |
| Monorepo type-check | PASS — 9/9 packages |
| Production build | PASS — 5/5 build tasks |
| Lint | PASS — 5/5 lint tasks |
| Serial API tests | PASS — 27 suites / 384 tests |
| Utility tests | PASS — 5 suites / 36 tests |
| P1 integrity checks | PASS |
| P2 operational checks | PASS |
| P4 rule checks | PASS |
| P5 static security audit | PASS |
| P5 contract audit | PASS |
| P5 integration audit | PASS |
| Route contract audit | PASS — 13 tests |

## Remaining boundaries

Provider certification for JAMB, WAEC, Paystack, and Remita remains dependent on institution credentials, external agreements, provider test environments, and deployment configuration. Docker-dependent hermetic E2E certification remains dependent on a runtime with Docker available. These boundaries are not simulated or falsely marked as certified.

## References

[1]: IMPLEMENTATION_CHANGELOG_V39.md "UniPortal ERP V39 enhancement changelog"
[2]: MODULE_MATURITY_AUDIT_V37.md "UniPortal ERP V37 module maturity audit"
[3]: apps/api/src/modules/exams/exams.service.ts "UniPortal ERP examinations service"
[4]: apps/api/src/modules/transport/transport.service.spec.ts "UniPortal ERP transport assurance tests"
[5]: apps/api/src/modules/research/research.service.spec.ts "UniPortal ERP research assurance tests"
