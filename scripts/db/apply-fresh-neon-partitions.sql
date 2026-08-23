-- UniPortal fresh-Neon partition baseline.
-- Run only after the controlled Neon data reset and Prisma db push.
-- The application reset script must verify the target and backup first.
-- student_results remains a plain table in this release; its runtime partition
-- manager skips it unless a future baseline explicitly converts it.

DO $$
DECLARE
  relation_record record;
BEGIN
  IF EXISTS (SELECT 1 FROM "payments") THEN
    RAISE EXCEPTION 'Fresh Neon partition baseline requires payments to be empty';
  END IF;
  IF EXISTS (SELECT 1 FROM "payslips") THEN
    RAISE EXCEPTION 'Fresh Neon partition baseline requires payslips to be empty';
  END IF;

  -- Drop only user-defined constraints from the empty plain parents. PostgreSQL
  -- exposes generated NOT NULL metadata as constraints in newer releases; those
  -- constraints may participate in the primary key and must never be dropped.
  FOR relation_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'payments'::regclass
      AND contype IN ('p', 'f', 'u', 'c', 'x')
      AND conname NOT LIKE '%_not_null'
  LOOP
    EXECUTE format('ALTER TABLE "payments" DROP CONSTRAINT %I', relation_record.conname);
  END LOOP;
  FOR relation_record IN
    SELECT indexrelid::regclass AS index_name
    FROM pg_index
    WHERE indrelid = 'payments'::regclass
      AND NOT indisprimary
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %s', relation_record.index_name);
  END LOOP;

  FOR relation_record IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'payslips'::regclass
      AND contype IN ('p', 'f', 'u', 'c', 'x')
      AND conname NOT LIKE '%_not_null'
  LOOP
    EXECUTE format('ALTER TABLE "payslips" DROP CONSTRAINT %I', relation_record.conname);
  END LOOP;
  FOR relation_record IN
    SELECT indexrelid::regclass AS index_name
    FROM pg_index
    WHERE indrelid = 'payslips'::regclass
      AND NOT indisprimary
  LOOP
    EXECUTE format('DROP INDEX IF EXISTS %s', relation_record.index_name);
  END LOOP;
END
$$;

ALTER TABLE "payments" RENAME TO "payments_plain_baseline";
CREATE TABLE "payments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "studentFeeId" UUID NOT NULL,
  "studentId" UUID NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "provider" "PaymentProvider" NOT NULL,
  "providerRef" VARCHAR(100) NOT NULL,
  "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
  "paidAt" TIMESTAMP(3),
  "channel" VARCHAR(50),
  "metadata" JSONB,
  "initiationLeaseUntil" TIMESTAMP(3),
  "idempotencyKey" VARCHAR(100),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "payments_pkey" PRIMARY KEY ("id", "createdAt")
) PARTITION BY RANGE ("createdAt");

CREATE INDEX "idx_payment_student_status" ON "payments" ("studentId", "status");
CREATE INDEX "idx_payment_provider_ref" ON "payments" ("providerRef");
CREATE INDEX "idx_payment_idempotency_key" ON "payments" ("idempotencyKey");
CREATE INDEX "idx_payment_created_at" ON "payments" ("createdAt");
CREATE INDEX "idx_payment_status_created" ON "payments" ("status", "createdAt");
CREATE INDEX "idx_payment_initiation_lease" ON "payments" ("status", "initiationLeaseUntil");
ALTER TABLE "payments"
  ADD CONSTRAINT "payments_studentFeeId_fkey"
    FOREIGN KEY ("studentFeeId") REFERENCES "student_fees" ("id"),
  ADD CONSTRAINT "payments_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "students" ("id");

DO $$
DECLARE
  d date := (date_trunc('month', CURRENT_DATE)::date - INTERVAL '12 months')::date;
  stop_date date := (date_trunc('month', CURRENT_DATE)::date + INTERVAL '24 months')::date;
BEGIN
  WHILE d < stop_date LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF "payments" FOR VALUES FROM (%L) TO (%L)',
      'payments_' || to_char(d, 'YYYY_MM'), d, (d + INTERVAL '1 month')::date
    );
    d := (d + INTERVAL '1 month')::date;
  END LOOP;
END
$$;
CREATE TABLE IF NOT EXISTS "payments_default" PARTITION OF "payments" DEFAULT;
DROP TABLE "payments_plain_baseline";

ALTER TABLE "payslips" RENAME TO "payslips_plain_baseline";
CREATE TABLE "payslips" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "staffId" UUID NOT NULL,
  "payrollRunId" UUID NOT NULL,
  "payPeriodDate" DATE NOT NULL,
  "basicSalary" DECIMAL(12,2) NOT NULL,
  "housingAllowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "transportAllowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "medicalAllowance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "otherAllowances" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "grossPay" DECIMAL(12,2) NOT NULL,
  "payeeTax" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "pensionEmployee" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "pensionEmployer" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "nhfDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "nhisDeduction" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "otherDeductions" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "totalDeductions" DECIMAL(12,2) NOT NULL,
  "netPay" DECIMAL(12,2) NOT NULL,
  "gradeLevel" VARCHAR(10) NOT NULL,
  "ippisNo" VARCHAR(20),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payslips_pkey" PRIMARY KEY ("id", "payPeriodDate")
) PARTITION BY RANGE ("payPeriodDate");

CREATE UNIQUE INDEX "uq_payslip_staff_run" ON "payslips" ("staffId", "payrollRunId", "payPeriodDate");
CREATE INDEX "idx_payslip_staff_date" ON "payslips" ("staffId", "createdAt");
CREATE INDEX "idx_payslip_run" ON "payslips" ("payrollRunId");
CREATE INDEX "idx_payslip_period" ON "payslips" ("payPeriodDate");
CREATE INDEX "idx_payslip_staff_year" ON "payslips" ("staffId", (EXTRACT(YEAR FROM "createdAt")::int));
ALTER TABLE "payslips"
  ADD CONSTRAINT "payslips_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "staff" ("id"),
  ADD CONSTRAINT "payslips_payrollRunId_fkey"
    FOREIGN KEY ("payrollRunId") REFERENCES "payroll_runs" ("id");

DO $$
DECLARE
  d date := (date_trunc('month', CURRENT_DATE)::date - INTERVAL '12 months')::date;
  stop_date date := (date_trunc('month', CURRENT_DATE)::date + INTERVAL '24 months')::date;
BEGIN
  WHILE d < stop_date LOOP
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF "payslips" FOR VALUES FROM (%L) TO (%L)',
      'payslips_' || to_char(d, 'YYYY_MM'), d, (d + INTERVAL '1 month')::date
    );
    d := (d + INTERVAL '1 month')::date;
  END LOOP;
END
$$;
CREATE TABLE IF NOT EXISTS "payslips_default" PARTITION OF "payslips" DEFAULT;
DROP TABLE "payslips_plain_baseline";
