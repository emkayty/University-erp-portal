-- Outbox reliability hardening: make retries scheduled and poison events visible.
ALTER TABLE domain_events
  ADD COLUMN IF NOT EXISTS "deadLetteredAt" TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS "nextAttemptAt" TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS "idx_outbox_retry_queue"
  ON domain_events ("processedAt", "deadLetteredAt", "nextAttemptAt", "createdAt");
