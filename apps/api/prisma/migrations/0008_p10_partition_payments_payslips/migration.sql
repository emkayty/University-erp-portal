-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0008: Payments/Payslips Partitioning (P10)
-- Fulfils the plan recorded in migration 9000_p4_payments_partitioning_deferred
-- and docs/CHANGELOG.md ("payments + payslips partitioning deferred to P10").
--
-- WHAT THIS DOES
--   payments  → PARTITION BY RANGE (createdAt),    PK ("id","createdAt")
--   payslips  → PARTITION BY RANGE (payPeriodDate), PK ("id","payPeriodDate")
--
-- WHY payslips PARTITIONS ON payPeriodDate, NOT createdAt (deviation from the
-- original spec's literal "created_at" choice — see schema.prisma model doc
-- for the full rationale): computePayroll() upserts one Payslip per
-- (staffId, payrollRunId) and must stay idempotent when a partially-failed
-- run is recomputed. Postgres requires the partition key inside every unique
-- constraint on a partitioned table, so uq_payslip_staff_run must include
-- it. createdAt differs between the original attempt and a retry; the
-- run's own period (year/month) does not. payPeriodDate is that period,
-- materialised as a DATE — it is identical on every retry, so folding it
-- into the unique constraint is a no-op for uniqueness while satisfying the
-- partitioning rule. payments keeps createdAt (a real payment event has no
-- equivalent stable, pre-known date to key on).
--
-- WHY providerRef / idempotencyKey lose their UNIQUE constraints:
-- Postgres cannot enforce a single-column UNIQUE across all partitions of a
-- partitioned table (each partition holds its own local index). A composite
-- UNIQUE(x, createdAt) would technically satisfy Postgres but would NOT
-- catch a retry (different createdAt) — reintroducing the double-payment
-- bug already fixed once as NEW-2. PaymentsService now enforces the SAME
-- guarantee at the application layer with pg_advisory_xact_lock(hashtext(key))
-- inside the transaction — the same pattern already used for matric number
-- generation and course registration in this codebase. See
-- payments.service.ts for the code change that accompanies this migration.
--
-- NO OTHER TABLE HOLDS A FOREIGN KEY TO payments.id OR payslips.id (verified
-- by grep across schema.prisma before writing this migration) — so there are
-- no cascading FK redesigns needed, only the rebuild below.
--
-- OPERATIONAL NOTE: this rewrites both tables (rename → recreate → copy →
-- verify → drop). On a table with meaningful production row counts this
-- takes an ACCESS EXCLUSIVE lock for the duration of the copy — run during a
-- maintenance window. On a fresh/dev database (no rows yet) this is instant.
-- Uses DATABASE_DIRECT_URL (bypasses PgBouncer) like all other DDL
-- migrations in this project — PgBouncer transaction-pooling mode does not
-- support the session-scoped DDL this migration performs.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── Safety: fail loudly rather than silently double-run ───────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_partitioned_table pt
    JOIN pg_class c ON c.oid = pt.partrelid
    WHERE c.relname = 'payments'
  ) THEN
    RAISE NOTICE 'payments is already partitioned — skipping (migration already applied)';
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 1: payments → PARTITION BY RANGE ("createdAt")
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE IF EXISTS "payments" RENAME TO "payments_old_p10";

CREATE TABLE "payments" (
  "id"             UUID            NOT NULL DEFAULT gen_random_uuid(),
  "studentFeeId"   UUID            NOT NULL,
  "studentId"      UUID            NOT NULL,
  "amount"         DECIMAL(12,2)   NOT NULL,
  "provider"       "PaymentProvider" NOT NULL,
  "providerRef"    VARCHAR(100)    NOT NULL,
  "status"         "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt"         TIMESTAMP(3),
  "channel"        VARCHAR(50),
  "metadata"       JSONB,
  "idempotencyKey" VARCHAR(100),
  "createdAt"      TIMESTAMP(3)    NOT NULL DEFAULT now(),
  "updatedAt"      TIMESTAMP(3)    NOT NULL,
  PRIMARY KEY ("id", "createdAt")
) PARTITION BY RANGE ("createdAt");

-- Indexes created on the partitioned PARENT propagate automatically to every
-- current AND future partition (Postgres 11+ "partitioned index").
CREATE INDEX "idx_payment_student_status" ON "payments" ("studentId", "status");
CREATE INDEX "idx_payment_provider_ref"   ON "payments" ("providerRef");
CREATE INDEX "idx_payment_idempotency_key" ON "payments" ("idempotencyKey");
CREATE INDEX "idx_payment_created_at"     ON "payments" ("createdAt");
CREATE INDEX "idx_payment_status_created" ON "payments" ("status", "createdAt");

-- Monthly partitions. PartitionManagerService's existing cron logic (H10,
-- already shipped in P0) takes over creating FUTURE partitions from here —
-- it already checks relkind='p', which is now true for this table. This
-- migration only needs to cover the initial go-live window; extend the
-- range below if deploying with older historical payment data to migrate.
DO $$
DECLARE
  d date := '2025-06-01';
BEGIN
  WHILE d < '2027-07-01' LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF "payments" FOR VALUES FROM (%L) TO (%L)',
      'payments_' || to_char(d, 'YYYY_MM'), d, d + interval '1 month'
    );
    d := d + interval '1 month';
  END LOOP;
END $$;

-- Safety net: catches any row outside the pre-created range instead of
-- erroring the write (e.g. PartitionManagerService cron hasn't run yet).
CREATE TABLE IF NOT EXISTS "payments_default" PARTITION OF "payments" DEFAULT;

-- FKs — must be re-added; renaming a table does NOT carry FKs referencing
-- into other tables over to the new partitioned parent automatically here
-- because this is a fresh CREATE TABLE, not an ALTER of the renamed one.
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_studentFeeId_fkey" FOREIGN KEY ("studentFeeId") REFERENCES "student_fees"("id"),
  ADD CONSTRAINT "payments_studentId_fkey"    FOREIGN KEY ("studentId")    REFERENCES "students"("id");

-- Copy existing data (no-op on a fresh database).
INSERT INTO "payments"
  ("id","studentFeeId","studentId","amount","provider","providerRef","status",
   "paidAt","channel","metadata","idempotencyKey","createdAt","updatedAt")
SELECT
   "id","studentFeeId","studentId","amount","provider","providerRef","status",
   "paidAt","channel","metadata","idempotencyKey","createdAt","updatedAt"
FROM "payments_old_p10";

DO $$
DECLARE old_count bigint; new_count bigint;
BEGIN
  SELECT count(*) INTO old_count FROM "payments_old_p10";
  SELECT count(*) INTO new_count FROM "payments";
  IF old_count <> new_count THEN
    RAISE EXCEPTION 'payments partitioning row-count mismatch: old=% new=% — ABORTING, payments_old_p10 preserved for investigation', old_count, new_count;
  END IF;
END $$;

DROP TABLE "payments_old_p10";

-- ═══════════════════════════════════════════════════════════════════════════════
-- PART 2: payslips → PARTITION BY RANGE ("payPeriodDate")
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE IF EXISTS "payslips" RENAME TO "payslips_old_p10";

CREATE TABLE "payslips" (
  "id"                 UUID          NOT NULL DEFAULT gen_random_uuid(),
  "staffId"            UUID          NOT NULL,
  "payrollRunId"       UUID          NOT NULL,
  "payPeriodDate"      DATE          NOT NULL,
  "basicSalary"        DECIMAL(12,2) NOT NULL,
  "housingAllowance"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "transportAllowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "medicalAllowance"   DECIMAL(12,2) NOT NULL DEFAULT 0,
  "otherAllowances"    DECIMAL(12,2) NOT NULL DEFAULT 0,
  "grossPay"           DECIMAL(12,2) NOT NULL,
  "payeeTax"           DECIMAL(12,2) NOT NULL DEFAULT 0,
  "pensionEmployee"    DECIMAL(12,2) NOT NULL DEFAULT 0,
  "pensionEmployer"    DECIMAL(12,2) NOT NULL DEFAULT 0,
  "nhfDeduction"       DECIMAL(12,2) NOT NULL DEFAULT 0,
  "nhisDeduction"      DECIMAL(12,2) NOT NULL DEFAULT 0,
  "otherDeductions"    DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalDeductions"    DECIMAL(12,2) NOT NULL,
  "netPay"             DECIMAL(12,2) NOT NULL,
  "gradeLevel"         VARCHAR(10)   NOT NULL,
  "ippisNo"            VARCHAR(20),
  "createdAt"          TIMESTAMP(3)  NOT NULL DEFAULT now(),
  PRIMARY KEY ("id", "payPeriodDate")
) PARTITION BY RANGE ("payPeriodDate");

CREATE UNIQUE INDEX "uq_payslip_staff_run" ON "payslips" ("staffId", "payrollRunId", "payPeriodDate");
CREATE INDEX "idx_payslip_staff_date" ON "payslips" ("staffId", "createdAt");
CREATE INDEX "idx_payslip_run"        ON "payslips" ("payrollRunId");
CREATE INDEX "idx_payslip_period"     ON "payslips" ("payPeriodDate");

DO $$
DECLARE
  d date := '2025-06-01';
BEGIN
  WHILE d < '2027-07-01' LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF "payslips" FOR VALUES FROM (%L) TO (%L)',
      'payslips_' || to_char(d, 'YYYY_MM'), d, d + interval '1 month'
    );
    d := d + interval '1 month';
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS "payslips_default" PARTITION OF "payslips" DEFAULT;

ALTER TABLE "payslips"
  ADD CONSTRAINT "payslips_staffId_fkey"      FOREIGN KEY ("staffId")      REFERENCES "staff"("id"),
  ADD CONSTRAINT "payslips_payrollRunId_fkey" FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs"("id");

INSERT INTO "payslips"
  ("id","staffId","payrollRunId","payPeriodDate","basicSalary","housingAllowance",
   "transportAllowance","medicalAllowance","otherAllowances","grossPay","payeeTax",
   "pensionEmployee","pensionEmployer","nhfDeduction","nhisDeduction","otherDeductions",
   "totalDeductions","netPay","gradeLevel","ippisNo","createdAt")
SELECT
   p."id", p."staffId", p."payrollRunId",
   -- Backfill payPeriodDate for pre-P10 rows from their PayrollRun's period —
   -- guarantees historical rows land in the correct partition and keep the
   -- same idempotency behaviour as newly-computed ones.
   make_date(pr."periodYear", pr."periodMonth", 1) AS "payPeriodDate",
   p."basicSalary", p."housingAllowance", p."transportAllowance", p."medicalAllowance",
   p."otherAllowances", p."grossPay", p."payeeTax", p."pensionEmployee", p."pensionEmployer",
   p."nhfDeduction", p."nhisDeduction", p."otherDeductions", p."totalDeductions", p."netPay",
   p."gradeLevel", p."ippisNo", p."createdAt"
FROM "payslips_old_p10" p
JOIN "payroll_runs" pr ON pr."id" = p."payrollRunId";

DO $$
DECLARE old_count bigint; new_count bigint;
BEGIN
  SELECT count(*) INTO old_count FROM "payslips_old_p10";
  SELECT count(*) INTO new_count FROM "payslips";
  IF old_count <> new_count THEN
    RAISE EXCEPTION 'payslips partitioning row-count mismatch: old=% new=% — ABORTING, payslips_old_p10 preserved for investigation (a mismatch here usually means an orphaned payslip whose payrollRun no longer exists)', old_count, new_count;
  END IF;
END $$;

DROP TABLE "payslips_old_p10";

-- ── Re-enable RLS + reinstate policies dropped by the table rebuild ───────────
-- (0002 enabled RLS on "payments"/"payslips" against the pre-P10 tables; a
-- RENAME preserves RLS state on the OLD table, but the NEW "payments"/
-- "payslips" created above are fresh tables and start with RLS disabled.)
ALTER TABLE "payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "payslips" ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS student_own_payments ON "payments";
CREATE POLICY student_own_payments ON "payments"
  FOR SELECT
  USING (
    current_setting('app.current_role', TRUE) = 'SUPER_ADMIN'
    OR "studentId"::text = current_setting('app.current_user_id', TRUE)
    OR current_setting('app.current_role', TRUE) IN ('REGISTRAR','VC','BURSAR')
  );

DROP POLICY IF EXISTS staff_own_payslips ON "payslips";
CREATE POLICY staff_own_payslips ON "payslips"
  FOR SELECT
  USING (
    current_setting('app.current_role', TRUE) = 'SUPER_ADMIN'
    OR "staffId"::text = current_setting('app.current_user_id', TRUE)
    OR current_setting('app.current_role', TRUE) IN ('HR_MANAGER','BURSAR','VC')
  );
