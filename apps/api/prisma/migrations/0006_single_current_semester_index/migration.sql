-- Migration 0006: Enforce at most one current semester at the DB level (H1 fix)
-- Mirrors the AcademicCalendar fix (C7 / uq_single_active_calendar) from migration 0002.
-- The partial unique index makes two concurrent isCurrent=true rows structurally impossible.
CREATE UNIQUE INDEX IF NOT EXISTS uq_single_current_semester
  ON semesters (is_current)
  WHERE is_current = TRUE;
