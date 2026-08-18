CREATE TABLE "application_drafts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "tokenHash" VARCHAR(64) NOT NULL,
  "payloadEncrypted" TEXT NOT NULL,
  "expiresAt" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastLoadedAt" TIMESTAMPTZ,
  CONSTRAINT "application_drafts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "application_drafts_tokenHash_key" ON "application_drafts"("tokenHash");
CREATE INDEX "idx_application_draft_expiry" ON "application_drafts"("expiresAt");
