-- Align enterprise RLS policies with the canonical request identity set by
-- PrismaService.withRls(): app.current_user_id.
--
-- Migration 0022 used the stale app.user_id name. Keep this correction
-- forward-only so already-deployed databases receive the same policy contract
-- without rewriting migration history.
ALTER TABLE "Notification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationPreference" ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notification_owner" ON "Notification";
DROP POLICY IF EXISTS "notification_preference_owner" ON "NotificationPreference";

CREATE POLICY "notification_owner" ON "Notification"
  USING ("userId" = current_setting('app.current_user_id', true));

CREATE POLICY "notification_preference_owner" ON "NotificationPreference"
  USING ("userId" = current_setting('app.current_user_id', true))
  WITH CHECK ("userId" = current_setting('app.current_user_id', true));
