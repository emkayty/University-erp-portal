# UniPortal ERP Changelog

## 2026-08-23 — Forensic audit remediation tranche

- Restored explicit payment and payslip RLS policies after fresh partition-parent replacement, and added an offline fresh-baseline contract verifier for policies, receipt claims, role attributes and partition safeguards.
- Restored the payment receipt-claim StudentFee foreign key and global receipt-reference/index contract in the fresh-Neon extras path.
- Added fail-closed verification to production database-role bootstrap for login, least privilege, NOINHERIT, CONNECT and the `uniportal_system` BYPASSRLS contract.
- Corrected mixed student/staff clinic scope evaluation, role-grant authorization-cache invalidation, hostel User.id → Student.id self-allocation resolution, search SQL/schema aliases and department-scope enforcement, examination attendance metrics, LMS finalized-mark protection, annual fee-year clearance, and library inventory/return ownership races.
- Added targeted regressions for all implemented application fixes; API tests, workspace tests, type-check, lint, API/web builds and existing security/governance gates pass in the sandbox.
- No Neon write, schema deployment, seed, role bootstrap, provider call or destructive Docker operation was performed during this implementation tranche. Disposable PostgreSQL rehearsal and explicit Neon reauthorization remain required before deployment.

## 2026-08-13 — Academic integrity hardening

- Added canonical `StudentResult.attemptNumber` and deterministic repeat-course ordering.
- Added registration/offering/semester/lecturer validation to result entry.
- Made degree-audit graduation thresholds fail closed when configuration is missing or invalid.
- Restricted degree-audit transfer credits to approved transfers and canonicalized repeated credits.
- Changed academic history snapshots to semester-level identity.
- Completed controlled INSERT/UPDATE RLS policies for protected operational tables.
- Removed generated build metadata and redundant audit-history files from the clean project distribution.
- Restored Prisma migration files to source control expectations.

## 2026-08-13 — Admissions Reference Data V6

- Added global Country and AdministrativeDivision reference data.
- Added Nigerian state/FCT → LGA dependent hierarchy with 774-LGA integrity gate.
- Added controlled Nigerian examination authorities: WAEC, NECO, NABTEB, NBAIS.
- Added authority-specific examination types and controlled academic subjects.
- Added normalized applicant origin and address reference IDs while retaining legacy string snapshots.
- Added public reference-data endpoints and converted applicant O'Level/location controls away from free text.

## P1 — User Experience

Role-aware dashboard, responsive navigation, academic-life hub, quick navigation, accessibility/focus improvements, and user-centred task entry points applied.
