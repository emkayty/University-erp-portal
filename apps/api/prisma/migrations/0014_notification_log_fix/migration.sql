-- Migration 0014: Fix notification_logs — add missing columns, relax template_id
--
-- Deep-audit fix (Aug 2026). notification_logs.template_id was NOT NULL
-- with no default, but the only code that ever wrote to this table
-- (NotificationsProcessor.logNotification()) never populated it, and also
-- passed template_key/subject/body — none of which existed as columns on
-- this table. That INSERT could not have succeeded as originally written
-- (Prisma would reject the missing required template_id at the type layer
-- before a query was even issued), so this table can be assumed empty in
-- any real deployment; the ADD COLUMN ... NOT NULL below does not need a
-- backfill for that reason. If this assumption is wrong for a given
-- environment (rows exist some other way), STOP and backfill template_key/
-- subject/body before applying, or add them nullable and tighten in a
-- follow-up migration once backfilled.
ALTER TABLE notification_logs
  ALTER COLUMN template_id DROP NOT NULL;

ALTER TABLE notification_logs
  ADD COLUMN template_key VARCHAR(100) NOT NULL DEFAULT '',
  ADD COLUMN subject      VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN body         TEXT         NOT NULL DEFAULT '';

-- Drop the temporary defaults now that the columns exist — new inserts
-- must supply real values (this matches the non-optional types in
-- schema.prisma; the DEFAULT above existed only to satisfy NOT NULL on
-- ALTER TABLE ADD COLUMN against a non-empty table, which cannot happen
-- here per the note above, but costs nothing to leave safe).
ALTER TABLE notification_logs
  ALTER COLUMN template_key DROP DEFAULT,
  ALTER COLUMN subject      DROP DEFAULT,
  ALTER COLUMN body         DROP DEFAULT;
