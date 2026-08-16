# UniPortal ERP V41 Enhancement Changelog

**Implementation date:** 15 August 2026  
**Base:** V40 enhanced release  
**Scope:** LMS quiz assessments, attempt and grading lifecycle, secure submission attachment references, frontend assessment workflows, and assurance coverage.

## Executive summary

V41 expands the LMS from assignment submission and content progress into a complete lightweight assessment lifecycle. Authorized staff can author quiz questions, students can take enrolment-gated quizzes with a three-attempt limit, objective questions are automatically graded, and short-answer attempts are routed to manual grading. Submission attachments now use validated opaque object keys with metadata rather than accepting arbitrary public URLs or unsafe paths.

The release remains compatible with the existing NestJS, Prisma, PostgreSQL, Next.js, React Query, audit logging, role guard, feature-flag, and RLS-aware PrismaService architecture.

## Implemented changes

### 1. Durable quiz and attachment schema

`apps/api/prisma/schema.prisma` now extends the LMS domain with:

| Model or field | Purpose |
|---|---|
| `QuizQuestion` | Stores quiz prompts, question type, options, correct-answer material, points, and ordering. |
| `QuizAttempt` | Stores a student’s attempt number, answers, lifecycle status, score, maximum score, timestamps, and instructor feedback. |
| `LmsSubmission.attachmentKey` | Stores an opaque object-storage key rather than a public URL. |
| `LmsSubmission.attachmentName`, `attachmentMime`, `attachmentSize` | Stores controlled metadata for submission evidence and later storage-provider integration. |

Back-relations were added to `CourseContent` and `Student`. Quiz attempt uniqueness is enforced by `(contentId, studentId, attemptNumber)`. The migration is `apps/api/prisma/migrations/0029_lms_quiz_assessment_v41/migration.sql`.

### 2. Validated assessment DTOs

`apps/api/src/modules/lms/dto/lms.dto.ts` now validates quiz question authoring, quiz answer maps, manual quiz grading, and attachment metadata.

Attachment keys are constrained to relative opaque object-key characters and reject absolute paths, protocol URLs, and traversal sequences. MIME types are restricted to the supported submission formats, and attachment size is capped at 10 MiB at the request boundary.

### 3. Quiz authoring and lifecycle service

`apps/api/src/modules/lms/lms.service.ts` now provides:

1. Staff quiz-question authoring restricted to `QUIZ` content.
2. Choice-question validation requiring options and objective correct answers.
3. Student question discovery with correct answers removed from the response.
4. Enrolment-gated attempt creation with a maximum of three attempts per student and quiz.
5. Automatic scoring for single choice, multiple choice, and true/false questions.
6. Manual-grading state for quizzes containing short-answer questions.
7. Student attempt history scoped by course offering.
8. Staff marking queues for quiz attempts.
9. Manual score and feedback grading with maximum-score validation and audit evidence.
10. Defense-in-depth service validation for attachment keys, independent of controller DTO validation.

Quiz states are explicit: `IN_PROGRESS`, `SUBMITTED`, and `GRADED`. Objective-only attempts move directly to `GRADED`; attempts containing short-answer questions remain `SUBMITTED` until an authorized instructor grades them.

### 4. LMS controller routes

`apps/api/src/modules/lms/lms.controller.ts` exposes:

| Route | Purpose |
|---|---|
| `POST /lms/quizzes/questions` | Create a validated quiz question. |
| `GET /lms/quizzes/:contentId/questions` | Read quiz questions, hiding correct answers for students. |
| `POST /lms/quizzes/:contentId/attempts` | Start an enrolment-gated student attempt. |
| `POST /lms/quizzes/attempts/:id/submit` | Submit answers for auto or manual grading. |
| `GET /lms/quizzes/attempts/my` | View the authenticated student’s quiz attempts. |
| `GET /lms/quizzes/attempts/content/:contentId` | Staff marking queue. |
| `PATCH /lms/quizzes/attempts/:id/grade` | Manually grade short-answer attempts. |

The routes retain the LMS feature flag, bearer authentication, role guard, response envelope, and UUID parsing conventions.

### 5. Frontend assessment and submission workflow

`apps/web/app/dashboard/lms/page.tsx` now includes:

1. A student quiz selector and question loader.
2. Attempt-start and answer-entry controls.
3. Multiple-choice, choice-list, true/false, and short-answer presentation paths.
4. Submission and result-state display for auto-graded and manually graded attempts.
5. Staff quiz authoring controls for question type, options, correct answer, and points.
6. Secure opaque attachment-key fields for assignment submissions, including file name, MIME type, and byte size.
7. Correct `contentType` payload naming when creating course content.

The UI communicates that public URLs are not accepted, keeping storage ownership and access control on the server side.

### 6. Assurance coverage

The LMS service suite now covers:

| Test | Coverage |
|---|---|
| Attachment key rejection | Public URLs and traversal-style keys are rejected before persistence. |
| Quiz authoring | Non-quiz content and incomplete choice questions are rejected. |
| Attempt creation | Objective quiz attempts calculate maximum score and three-attempt limits are enforced. |
| Objective auto-grading | Correct answers produce a graded attempt and score. |
| Short-answer lifecycle | Short-answer attempts remain submitted until manual grading. |
| Manual grading | Instructor score and feedback are persisted with audit evidence. |

## Verification results

The final V41 deep-verification run completed successfully:

| Check | Result |
|---|---:|
| Dependency installation | PASS |
| Prisma generation | PASS |
| Prisma validation | PASS |
| Monorepo type-check | PASS — 9/9 packages |
| Production build | PASS — 5/5 build tasks |
| Lint | PASS — 5/5 lint tasks |
| Serial API tests | PASS — 27 suites / 388 tests |
| Utility tests | PASS — 5 suites / 36 tests |
| P1 integrity checks | PASS |
| P2 operational checks | PASS |
| P4 rule checks | PASS |
| P5 static security audit | PASS |
| P5 contract audit | PASS |
| P5 integration audit | PASS |
| Route contract audit | PASS — 13 tests |

## Remaining boundaries

V41 stores validated opaque attachment references but does not invent a storage-provider upload service where the repository has no LMS-specific upload adapter. A production deployment should connect these keys to the institution’s private object-storage presign and authorization flow. External JAMB, WAEC, Paystack, and Remita certification remains deployment/provider-dependent. Docker-dependent hermetic E2E certification remains dependent on a runtime with Docker available.

## References

[1]: IMPLEMENTATION_CHANGELOG_V40.md "UniPortal ERP V40 enhancement changelog"
[2]: IMPLEMENTATION_CHANGELOG_V39.md "UniPortal ERP V39 enhancement changelog"
[3]: apps/api/prisma/schema.prisma "UniPortal ERP Prisma schema"
[4]: apps/api/src/modules/lms/lms.service.ts "UniPortal ERP LMS service"
[5]: apps/web/app/dashboard/lms/page.tsx "UniPortal ERP LMS workspace"
