# V4 — Examinations, Assessment & Grading hardening

Applied the requested end-to-end academic integrity and usability upgrades:

- Added assessment schemes/components/marks with exact 100% weight validation.
- Added live gradebook data model and APIs.
- Added validate-first CSV grade import and course-specific CSV template/export.
- Added draft-result generation from finalized assessment calculations.
- Added configurable Nigerian 5-point and US 4-point grading through InstitutionSettings.
- Snapshot grading system/policy version on each result.
- Replaced silent score clamping with strict validation.
- Represent exam absence as ABS rather than silently converting absence to F.
- Added immutable result version records for published-result amendments.
- Added exam candidate generation and separate examination attendance.
- Added exam venue master data model and examination reports.
- Added exam-date-window and course-offering semester validation.
- Added registered-student exam clash detection.
- Added course and semester result reporting APIs.
- Added assessment weighting controls to institutional configuration.
- Added documentation for the new examination/assessment/grading architecture.

Validation limitation: this sandbox does not contain the workspace dependencies/Prisma generated client, and an attempt to run `npx prisma validate` timed out. Static TypeScript parsing of the modified files produced no syntax errors after correction; dependency/type resolution could not be completed without installing the project's dependencies.
