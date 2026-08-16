# UniPortal ERP V39 Enhancement Changelog

**Implementation date:** 15 August 2026  
**Base:** V38 enhanced release  
**Scope:** LMS learning lifecycle, examination operations, schema integrity, frontend workflow depth, and assurance coverage.

## Executive summary

V39 extends the UniPortal ERP beyond content publishing and read-only examination monitoring. The LMS now supports enrolment-gated submissions, grading, progress tracking, and moderated course discussions. Examination operations now include bulk invigilator attendance capture and richer candidate-coverage reporting. The frontend exposes these workflows through student and staff interfaces, while the database schema and migration history now contain explicit durable models for the new learning records.

The release remains compatible with the existing NestJS, Prisma, PostgreSQL, Next.js, React Query, RLS-aware PrismaService, and audit-log architecture.

## Implemented changes

### 1. LMS learning-lifecycle schema

`apps/api/prisma/schema.prisma` now defines:

| Model | Purpose |
|---|---|
| `LmsSubmission` | One idempotent assignment/quiz submission per student and content item, with response text, file URL, status, score, feedback, and grader evidence. |
| `LmsProgress` | Per-student content progress from 0–100%, first/last viewed timestamps, and completion timestamp. |
| `LmsDiscussionPost` | Course and content-scoped threaded discussion posts with soft deletion, parent/reply relationships, and author identity. |

Back-relations were added to `User`, `Student`, `CourseOffering`, and `CourseContent`. The unique constraints prevent duplicate submissions and progress rows. The progress check constraint prevents values outside the 0–100 range.

`apps/api/prisma/migrations/0028_lms_learning_lifecycle_v39/migration.sql` creates the enum, tables, indexes, foreign keys, uniqueness constraints, and progress-range check in a repeat-safe migration form.

### 2. LMS DTO and service workflows

`apps/api/src/modules/lms/dto/lms.dto.ts` now validates submission, grading, progress, and discussion requests.

`apps/api/src/modules/lms/lms.service.ts` now provides:

1. Idempotent student assignment/quiz submission through a content/student unique key.
2. Student submission history by course offering.
3. Staff marking queues by content item.
4. Score and feedback grading with `GRADED` state and audit evidence.
5. Enrolment-gated progress updates and completion tracking.
6. Student progress discovery for an offering.
7. Enrolment-gated course discussion creation and listing.
8. Content and course-offering validation for discussion posts and replies.
9. Author-or-privileged soft deletion for discussion moderation.

All student actions resolve the linked Student record through the authenticated User identity. Students cannot access another offering’s content, submissions, progress, or discussions by supplying arbitrary UUIDs.

### 3. LMS controller and frontend integration

`apps/api/src/modules/lms/lms.controller.ts` exposes the new routes:

| Route | Purpose |
|---|---|
| `POST /lms/submissions` | Submit assignment or quiz response. |
| `GET /lms/submissions/my` | View the authenticated student’s submissions. |
| `GET /lms/submissions/content/:contentId` | Staff marking queue. |
| `PATCH /lms/submissions/:id/grade` | Grade with score and feedback. |
| `PATCH /lms/progress/:contentId` | Update student content completion progress. |
| `GET /lms/progress/:courseOfferingId` | View student progress for an offering. |
| `POST /lms/discussions` | Create a course/content discussion post. |
| `GET /lms/discussions/:courseOfferingId` | Read discussion threads. |
| `DELETE /lms/discussions/:id` | Soft-delete own or privileged-authorized posts. |

`apps/web/app/dashboard/lms/page.tsx` now offers students an assignment/quiz selector, response submission, completion controls, progress feedback, and discussion posting. Staff operators receive a marking panel with score input and grading actions. Existing content and announcement views were corrected to consume the backend’s `contentType` and `isPublished` fields instead of stale aliases.

### 4. Examination operations

`apps/api/src/modules/exams/dto/exams.dto.ts` now includes validated bulk exam-attendance DTOs with nested candidate records.

`apps/api/src/modules/exams/exams.service.ts` now provides `bulkRecordExamAttendance()`, which processes candidate records independently and returns recorded and failed counts with per-student error messages rather than aborting the entire invigilation batch. `getExamReport()` now returns present count and attendance coverage percentage in addition to candidate totals, status counts, and missing records.

`apps/api/src/modules/exams/exams.controller.ts` exposes `POST /exams/timetable/:id/attendance/bulk` for authorized examination operators.

`apps/web/app/dashboard/exams/page.tsx` now displays attendance coverage and present counts, and provides per-candidate Present/Absent controls for authorized operators.

### 5. Prisma service integration

The new LMS delegates were added to both `PrismaService` and `DirectPrismaService`. This keeps the new models available through the same RLS-aware request transaction and trusted system-transaction paths already used by the application.

### 6. Assurance coverage

The LMS service test suite now covers:

| Test | Coverage |
|---|---|
| Unregistered student content access | Forbidden enrolment boundary. |
| Published content access | Enrolled student success path. |
| Course discovery | Registered/completed offering filtering. |
| Idempotent submission | Content/student unique-key upsert. |
| Progress completion | Atomic progress upsert through 100%. |
| Grading | Score/status update and audit evidence. |
| Discussion integrity | Cross-offering parent rejection. |

The examination service test suite now covers bulk attendance partial failure handling and the new report coverage metrics.

## Verification results

The final V39 deep-verification run completed successfully:

| Check | Result |
|---|---:|
| Dependency installation | PASS |
| Prisma generation | PASS |
| Prisma validation | PASS |
| Monorepo type-check | PASS — 9/9 packages |
| Production build | PASS — 5/5 build tasks |
| Lint | PASS — 5/5 lint tasks |
| Serial API tests | PASS — 25 suites / 371 tests |
| Utility tests | PASS — 5 suites / 36 tests |
| P1 integrity checks | PASS |
| P2 operational checks | PASS |
| P4 rule checks | PASS |
| P5 static security audit | PASS |
| P5 contract audit | PASS |
| P5 integration audit | PASS |
| Route contract audit | PASS — 13 tests |

## Remaining boundaries

External provider certification for JAMB, WAEC, Paystack, and Remita remains deployment-dependent and is not simulated by this release. Docker-dependent hermetic E2E certification remains dependent on a runtime with Docker available. The repository’s schema, type, build, lint, unit, static, contract, and route checks all pass in the available environment.

The V39 LMS remains intentionally lightweight and institution-controlled. It now includes the core submission, marking, progress, and discussion lifecycle; full online quiz engines, plagiarism scanning, S3 upload orchestration, and proctoring integrations remain separate product extensions requiring additional provider and policy decisions.

## References

[1]: IMPLEMENTATION_CHANGELOG_V38.md "UniPortal ERP V38 enhancement changelog"
[2]: MODULE_MATURITY_AUDIT_V37.md "UniPortal ERP V37 module maturity audit"
[3]: apps/api/prisma/schema.prisma "UniPortal ERP Prisma schema"
[4]: apps/api/src/modules/lms/lms.service.ts "UniPortal ERP LMS service"
[5]: apps/api/src/modules/exams/exams.service.ts "UniPortal ERP examinations service"
