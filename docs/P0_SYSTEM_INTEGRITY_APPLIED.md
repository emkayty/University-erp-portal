# P0 System Integrity — Applied

## Applied

- Canonical Student identity bound to `Person`.
- Students bound to a versioned `CurriculumVersion`.
- Versioned programme curriculum with programme-specific CCMAS classification.
- CourseOffering semester is authoritative through `semesterId`.
- CourseOffering supports multiple sections and enforces `(course, semester, section)`.
- CourseOffering lecturer is a real Staff foreign key.
- Faculty Dean and Department HOD are real Staff relationships.
- Admission decisions are programme-specific.
- Admission screening evaluates all submitted programme choices.
- Offers require the selected programme choice to be eligible.
- O'Level subjects can use controlled `AcademicSubject` references.
- Exam candidate, invigilator and attendance relationships are database-enforced.
- Exam attendance is restricted to generated eligible candidates.
- Exam venue is controlled by `ExamVenue` for new timetable entries.
- Attendance requires a valid course registration and valid semester teaching date.
- Results and attendance are tied to course registrations at database level.
- Assessment marks are tied to their course offering; DB trigger prevents component/offering mismatch.
- Grade upload batches are tied to their offering and semester; DB trigger prevents mismatch.
- Medical records and prescriptions enforce patient consistency with their parent records.
- Clinic appointment/prescription/history access is self-or-health-scope restricted.
- Drug dispensing rechecks stock under row lock.
- SUPER_ADMIN is no longer an implicit RBAC bypass; it must be explicitly declared by controllers.
- Fee waivers use maker/checker segregation and row locking for cumulative-cap enforcement.
- Graduation now follows audit → recommendation → independent approval → graduation.
- Graduation requires actual required clearance records; an empty clearance set no longer evaluates as cleared.
- Graduation candidates are RLS protected.
- General student list/profile responses no longer expose NIN/BVN.
- Deprecated `seed.ts.tmp` removed.
- Legacy CourseOffering semester remains only as a compatibility snapshot and is synchronized from `semesterId`.

## Migration

`apps/api/prisma/migrations/0020_p0_system_integrity/migration.sql`

The migration deliberately raises an error when existing data cannot be safely mapped to the new authoritative relationships. It does not silently invent academic history.

## Verification

Static integrity checks performed after the repair:

- 98 Prisma models detected.
- No malformed named Prisma relation pairs detected.
- Critical `StudentResult`, `AttendanceRecord`, `Semester`, `CurriculumVersion`, and `GraduationCandidate` models present.
- No controller `@Roles()` declarations without explicit `SUPER_ADMIN` after the RBAC hardening pass.
- No source references to retired `uq_prog_course_sem` / `uq_course_offering` Prisma unique names.
- Temporary `seed.ts.tmp` removed.

A full Prisma generation/type-check/E2E run still requires installing the project's locked dependencies and connecting to a test PostgreSQL database. It was not falsely marked as passed in this repair.
