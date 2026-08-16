-- Migration 0013: Rename firs_exported_at → nrs_exported_at on payroll_runs
--
-- Deep-audit fix (Aug 2026): FIRS (Federal Inland Revenue Service) was
-- renamed the Nigeria Revenue Service (NRS) under the NRS Establishment Act
-- 2025, effective 1 January 2026, as part of the broader Nigeria Tax Act
-- 2025 reform package. This column tracks when a payroll run's PAYE
-- remittance export was generated — renaming it to match the agency's
-- current name. The column was confirmed unused by any application code
-- (grep across apps/api/src and apps/web found zero references) before
-- this rename, so no backfill or dual-write period is needed.
ALTER TABLE payroll_runs
  RENAME COLUMN firs_exported_at TO nrs_exported_at;
