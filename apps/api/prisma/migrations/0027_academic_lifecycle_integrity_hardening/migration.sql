-- Academic lifecycle integrity hardening.
--
-- This migration is append-only: it preserves all existing audit/plan records,
-- adds immutable policy provenance, introduces an explicit placement lifecycle,
-- and prevents concurrent requests from leaving conflicting active plans.

CREATE TYPE "AcademicPolicyScope" AS ENUM ('INSTITUTION', 'FACULTY', 'DEPARTMENT', 'PROGRAMME');
CREATE TYPE "AcademicPolicyVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'REVOKED', 'EXPIRED');

CREATE TABLE "academic_policy_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "policy_type" VARCHAR(40) NOT NULL,
  "scope" "AcademicPolicyScope" NOT NULL DEFAULT 'INSTITUTION',
  "scope_id" UUID,
  "priority" INTEGER NOT NULL DEFAULT 0,
  "rule_definition" JSONB NOT NULL,
  "approval_status" "AcademicPolicyVersionStatus" NOT NULL DEFAULT 'DRAFT',
  "effective_from" DATE NOT NULL DEFAULT CURRENT_DATE,
  "effective_to" DATE,
  "created_by_id" UUID,
  "approved_by_id" UUID,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "academic_policy_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ck_academic_policy_effective_range"
    CHECK ("effective_to" IS NULL OR "effective_to" >= "effective_from"),
  CONSTRAINT "ck_academic_policy_scope_id"
    CHECK (("scope" = 'INSTITUTION' AND "scope_id" IS NULL)
      OR ("scope" <> 'INSTITUTION' AND "scope_id" IS NOT NULL))
);
CREATE INDEX "idx_academic_policy_active"
  ON "academic_policy_versions"("policy_type", "approval_status", "effective_from");
CREATE INDEX "idx_academic_policy_scope"
  ON "academic_policy_versions"("scope", "scope_id", "priority");

ALTER TABLE "progression_evaluations"
  ADD COLUMN "policy_version_id" UUID;
ALTER TABLE "academic_standings"
  ADD COLUMN "policy_version_id" UUID;

ALTER TABLE "academic_placements"
  ADD COLUMN "source_progression_evaluation_id" UUID,
  ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'RECOMMENDED',
  ADD COLUMN "applied_by_id" UUID,
  ADD COLUMN "applied_at" TIMESTAMP(3);

-- Existing releases may have accumulated duplicate active recommendations.
-- Keep the most recently updated one active, retaining older rows as historical
-- superseded recommendations before installing the partial unique index.
WITH ranked_active_plans AS (
  SELECT "id", row_number() OVER (
    PARTITION BY "student_id"
    ORDER BY "updated_at" DESC, "created_at" DESC, "id" DESC
  ) AS rank
  FROM "academic_plans"
  WHERE "status" = 'ACTIVE'
)
UPDATE "academic_plans" AS p
SET "status" = 'SUPERSEDED'
FROM ranked_active_plans AS r
WHERE p."id" = r."id" AND r.rank > 1;

CREATE UNIQUE INDEX "uq_academic_plan_one_active_per_student"
  ON "academic_plans"("student_id")
  WHERE "status" = 'ACTIVE';
CREATE UNIQUE INDEX "uq_progression_student_history_policy"
  ON "progression_evaluations"("student_id", "academic_history_id", "policy_version_id");
CREATE UNIQUE INDEX "uq_standing_student_history_policy"
  ON "academic_standings"("student_id", "academic_history_id", "policy_version_id");
CREATE UNIQUE INDEX "uq_academic_placement_source_progression"
  ON "academic_placements"("source_progression_evaluation_id");
CREATE INDEX "idx_academic_placement_student_status_date"
  ON "academic_placements"("student_id", "status", "effective_date");

ALTER TABLE "academic_placements"
  ADD CONSTRAINT "ck_academic_placement_status"
  CHECK ("status" IN ('RECOMMENDED', 'APPROVED', 'REJECTED', 'APPLIED', 'REVOKED'));

ALTER TABLE "academic_placements"
  ADD CONSTRAINT "ck_academic_placement_application"
  CHECK (("status" <> 'APPLIED') OR ("applied_at" IS NOT NULL AND "applied_by_id" IS NOT NULL));

CREATE TABLE "academic_substitutions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "student_id" UUID NOT NULL,
  "curriculum_requirement_id" UUID NOT NULL,
  "substitute_course_id" UUID NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  "reason" TEXT NOT NULL,
  "evidence_ref" VARCHAR(500),
  "approved_by_id" UUID,
  "approved_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "academic_substitutions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "academic_substitutions_student_id_fkey"
    FOREIGN KEY ("student_id") REFERENCES "students"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "academic_substitutions_substitute_course_id_fkey"
    FOREIGN KEY ("substitute_course_id") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ck_academic_substitution_status"
    CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED', 'REVOKED'))
);
CREATE UNIQUE INDEX "uq_student_academic_substitution"
  ON "academic_substitutions"("student_id", "curriculum_requirement_id");
CREATE INDEX "idx_student_academic_substitution_status"
  ON "academic_substitutions"("student_id", "status");

-- Payment initiation durability for partitioned payments.
ALTER TYPE "PaymentStatus" ADD VALUE IF NOT EXISTS 'INITIATING' BEFORE 'PENDING';
ALTER TABLE "payments"
  ADD COLUMN "initiation_lease_until" TIMESTAMP(3);
CREATE INDEX "idx_payment_initiation_lease"
  ON "payments"("status", "initiation_lease_until");

-- A partitioned payment table cannot provide a global unique constraint on an
-- external receipt reference. Claim TSA/GIFMIS receipts in this unpartitioned
-- registry before creating a ledger payment, making repeated manual entry
-- fail deterministically even across monthly payment partitions.
CREATE TABLE "payment_receipt_claims" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "receipt_reference" VARCHAR(100) NOT NULL,
  "payment_id" UUID NOT NULL,
  "student_fee_id" UUID NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payment_receipt_claims_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "payment_receipt_claims_receipt_reference_key" UNIQUE ("receipt_reference"),
  CONSTRAINT "payment_receipt_claims_student_fee_id_fkey"
    FOREIGN KEY ("student_fee_id") REFERENCES "student_fees"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "idx_payment_receipt_claim_payment"
  ON "payment_receipt_claims"("payment_id");
