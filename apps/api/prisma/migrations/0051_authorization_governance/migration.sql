-- Authorization governance: effective role assignments, delegations, and SoD rules.

ALTER TABLE "user_roles"
  ADD COLUMN "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "effectiveUntil" TIMESTAMP(3),
  ADD COLUMN "revokedAt" TIMESTAMP(3),
  ADD COLUMN "revokedBy" UUID,
  ADD COLUMN "grantReason" VARCHAR(500);

ALTER TABLE "user_roles"
  ADD CONSTRAINT "user_roles_effective_window_check"
  CHECK ("effectiveUntil" IS NULL OR "effectiveUntil" > "effectiveFrom");

CREATE INDEX "idx_user_roles_effective"
  ON "user_roles" ("userId", "effectiveFrom", "effectiveUntil", "revokedAt");

CREATE INDEX "idx_user_roles_role_effective"
  ON "user_roles" ("roleName", "effectiveFrom", "effectiveUntil", "revokedAt");

CREATE TYPE "DelegationStatus" AS ENUM ('ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TABLE "role_conflict_rules" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "roleA" "RoleName" NOT NULL,
  "roleB" "RoleName" NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "reason" VARCHAR(500) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "role_conflict_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "role_conflict_rules_code_key"
  ON "role_conflict_rules" ("code");
CREATE UNIQUE INDEX "uq_role_conflict_pair"
  ON "role_conflict_rules" ("roleA", "roleB");
CREATE INDEX "idx_role_conflict_active"
  ON "role_conflict_rules" ("active");

CREATE TABLE "role_delegations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "delegatorId" UUID NOT NULL,
  "delegateeId" UUID NOT NULL,
  "roleName" "RoleName" NOT NULL,
  "staffScope" JSONB,
  "startsAt" TIMESTAMP(3) NOT NULL,
  "endsAt" TIMESTAMP(3) NOT NULL,
  "status" "DelegationStatus" NOT NULL DEFAULT 'ACTIVE',
  "reason" VARCHAR(500) NOT NULL,
  "approvedBy" UUID,
  "revokedAt" TIMESTAMP(3),
  "revokedBy" UUID,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "role_delegations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "role_delegations_window_check" CHECK ("endsAt" > "startsAt"),
  CONSTRAINT "role_delegations_no_self_check" CHECK ("delegatorId" <> "delegateeId"),
  CONSTRAINT "role_delegations_approval_check" CHECK ("approvedBy" IS NULL OR "approvedBy" <> "delegateeId")
);

CREATE INDEX "idx_role_delegations_delegatee_active"
  ON "role_delegations" ("delegateeId", "status", "startsAt", "endsAt");
CREATE INDEX "idx_role_delegations_delegator_active"
  ON "role_delegations" ("delegatorId", "status", "startsAt", "endsAt");

ALTER TABLE "role_delegations"
  ADD CONSTRAINT "role_delegations_delegatorId_fkey"
  FOREIGN KEY ("delegatorId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "role_delegations_delegateeId_fkey"
  FOREIGN KEY ("delegateeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Default high-risk conflicts. These can be deactivated only through a governed
-- policy-management path after institutional review.
INSERT INTO "role_conflict_rules" ("roleA", "roleB", "code", "reason", "updatedAt") VALUES
  ('BURSAR', 'REGISTRAR', 'BURSAR_REGISTRAR', 'Finance custody/approval and academic-record authority must be separated.', CURRENT_TIMESTAMP),
  ('BURSAR', 'HR_MANAGER', 'BURSAR_HR_MANAGER', 'Finance authority and personnel master-data authority must be separated.', CURRENT_TIMESTAMP),
  ('REGISTRAR', 'HR_MANAGER', 'REGISTRAR_HR_MANAGER', 'Academic records authority and personnel master-data authority must be separated.', CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;
