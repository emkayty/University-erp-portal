# UniPortal ERP Changelog

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
