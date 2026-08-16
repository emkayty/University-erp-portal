# Production Repair Summary — 13 August 2026

This distribution incorporates the integrity, security, academic-domain, and repository-cleanliness fixes identified during the post-integration review.

## Release blockers fixed

- FORCE-RLS protected tables now have explicit controlled write policies.
- Protected Prisma delegates automatically use the request-scoped RLS transaction during HTTP requests.
- Background/pre-auth protected-table access uses the dedicated `uniportal_system` connection instead of an unscoped `uniportal_app` connection.
- Result entry requires a valid student, matching course-offering semester, valid registration, and lecturer assignment (unless an authorized academic administrator is submitting).
- Result attempt numbers are canonical, deterministic, concurrency-safe, and used consistently by repeat-course policy.
- CGPA repeat handling and degree-audit credit handling now share the same attempt semantics. Failed attempts never earn graduation credit.
- Degree-audit mandatory thresholds fail closed when configuration is missing or invalid.
- Transfer credit is restricted to approved transfers and cannot be silently double-counted against an already satisfied local course/requirement.
- Academic history is now keyed by semester-period identity; legacy records remain preserved without fabricated semester assignments.
- Policy resolution has a deterministic final tie-breaker.
- Degree allocation includes bounded deterministic backtracking instead of relying solely on a greedy ordering.
- Report queries were corrected to the actual Prisma schema (`score`, `provider`, `amount`, real semester relations/status values) and protected raw SQL follows the same RLS/system routing.
- Read-only report transaction batches were changed to `Promise.all` where an ambient RLS transaction cannot safely support Prisma's batch `$transaction` form.
- Generated build metadata and redundant audit-history files were removed. Prisma migration SQL is no longer ignored by `.gitignore`.

## Verification performed

- TypeScript transpilation/syntax verification passed for the modified API services/controllers/processors.
- The pure academic engine and grading utilities type-check successfully with an ES2022 TypeScript check.
- Critical academic scenarios were executed directly: repeat-credit de-duplication, pending-transfer rejection, and invalid-policy rejection.
- A live PostgreSQL/Prisma integration run was not possible in this sandbox because the uploaded project has no installed workspace dependencies/database runtime. The next environment must run Prisma generation, migration validation, the full Jest suite, and an RLS smoke test before production deployment.

## Admissions Domain V5 — August 2026

The admissions subsystem was upgraded from a small applicant/JAMB workflow to a structured Applicant & Admissions domain. The compatibility Applicant record remains, while normalized Person, Application, O'Level sittings/subjects, previous education, addresses, guardians, documents, programme requirements, screening, decisions and offers were added. Application submission now validates cycle/type, programme choices, declaration, age using calendar arithmetic, duplicate email/JAMB within cycle, and capacity under an advisory lock. Programme-specific admission requirements can be configured instead of hard-coding one universal rule. Staff can evaluate eligibility and verify application documents. Application completion is calculated and stored for UX/reporting.
