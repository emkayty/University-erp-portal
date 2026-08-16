-- P5 integrity repair: operational indexes for intelligence reads.
-- Defensive indexes only; no destructive data operation.
CREATE INDEX IF NOT EXISTS "EnterpriseAlert_created_idx"
  ON "EnterpriseAlert"("createdAt");

CREATE INDEX IF NOT EXISTS "AutomationTask_due_idx"
  ON "AutomationTask"("dueAt");

-- Prevent accidental duplicate automation task codes for the same active work item
-- only when a code is explicitly populated; historical rows remain untouched.
