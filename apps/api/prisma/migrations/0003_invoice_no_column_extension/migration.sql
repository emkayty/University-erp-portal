-- Migration 0003: Extend invoice_no column length
-- NEW-4 FIX: Switch to sequential counter invoice number format:
--   INV-{academicYearNoSlash}-{feeType3chars}-{seq6digits}
--   e.g. INV-20252026-TUI-000001 (24 chars)
-- Previous 8-hex-char UUID fragment format (25 chars) had ~4.6% collision
-- probability at 20,000 students. Sequential counter is collision-free.
-- Column extended to VARCHAR(50) to allow format evolution without another migration.
ALTER TABLE student_fees
  ALTER COLUMN invoice_no TYPE VARCHAR(50);
