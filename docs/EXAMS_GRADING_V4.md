# Examinations, Assessment & Grading V4

## Principles
- Raw assessment evidence is stored separately from derived final score/grade.
- Academic results are policy-driven and historical grading policy is snapshotted on each result.
- Nigerian 5-point and US 4-point grading are selected by institution configuration.
- No automatic academic decision is made by anomaly detection; flags require human review.
- Published result amendments increment an immutable result version and preserve the audit trail.
- Grade imports are validate-first; uploaded grades never override server-owned course, registration, credit or grading-policy data.

## Live gradebook
`AssessmentScheme -> AssessmentComponent -> AssessmentMark -> weighted final score -> grading policy -> draft StudentResult`.

The gradebook exposes completeness, calculated final score, and server-derived grade/grade point.

## Upload/download
- `GET /api/v1/assessment/offerings/:id/template` returns a course-specific CSV template.
- `POST /api/v1/assessment/upload/csv` validates a CSV without silently publishing or changing official results.
- `GET /api/v1/assessment/offerings/:id/export` exports the current gradebook.

## Examination integrity
- Exam dates must fall within the semester examination window.
- The course offering semester must match the timetable semester.
- Venue overlap is rejected.
- Registered-student examination overlap is rejected.
- Candidate lists are generated from valid course registrations.
- Examination attendance is separate from teaching attendance.

## Reports
- Course result report: distribution, mean, pass rate, pending/published counts and rows.
- Semester result report: result volume, average GPA and grade distribution.
- Transcript data identifies the grading system used.

## Nigerian / US grading
`InstitutionSettings.gradingSystem` selects `NIGERIAN_5_POINT` or `US_4_POINT`. Results snapshot `gradingSystemSnapshot` and `gradingPolicyVersion` so historical results remain reproducible after policy changes.

The US scale is an institutional default profile, not a universal American rule. Score boundaries should be treated as policy and versioned if the university needs a different boundary set.
