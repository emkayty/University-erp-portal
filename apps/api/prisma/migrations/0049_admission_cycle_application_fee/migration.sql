ALTER TABLE "admission_cycles"
  ADD COLUMN "applicationFeeRequired" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "applicationFeeAmount" DECIMAL(12, 2),
  ADD COLUMN "applicationFeeCurrency" VARCHAR(3) NOT NULL DEFAULT 'NGN';
