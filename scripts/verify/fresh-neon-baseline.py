"""Offline contract gate for the controlled fresh-Neon baseline.

This verifier intentionally performs no database connection or write. It protects
against regressions where db push reports success but the supplemental baseline
omits relation-owned RLS policies, migration-only payment receipt claims, or the
restricted role contract.
"""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = (ROOT / "apps/api/prisma/schema.prisma").read_text()
PARTITIONS = (ROOT / "scripts/db/apply-fresh-neon-partitions.sql").read_text()
EXTRAS = (ROOT / "scripts/db/apply-fresh-neon-extras.sql").read_text()
HARDENING = (ROOT / "scripts/db/apply-post-schema-hardening.sh").read_text()
ROLES = (ROOT / "scripts/db/bootstrap-production-roles.sh").read_text()
MIGRATION = (ROOT / "apps/api/prisma/migrations/0027_academic_lifecycle_integrity_hardening/migration.sql").read_text()

checks = {
    "current receipt-claim model is present": "model PaymentReceiptClaim" in SCHEMA and '@@map("payment_receipt_claims")' in SCHEMA,
    "receipt claim uses current physical field names": all(token in SCHEMA for token in ["receiptReference", "paymentId", "studentFeeId", "createdAt"]),
    "receipt claim foreign key is restored": 'payment_receipt_claims_student_fee_id_fkey' in EXTRAS and 'FOREIGN KEY ("studentFeeId") REFERENCES "student_fees"("id")' in EXTRAS,
    "receipt claim global uniqueness is restored": 'payment_receipt_claims_receipt_reference_key' in EXTRAS and 'CREATE UNIQUE INDEX IF NOT EXISTS "payment_receipt_claims_receipt_reference_key"' in EXTRAS,
    "receipt claim payment lookup index is restored": 'idx_payment_receipt_claim_payment' in EXTRAS and 'ON "payment_receipt_claims" ("paymentId")' in EXTRAS,
    "payment read policy is explicitly recreated": 'CREATE POLICY payment_read ON payments' in HARDENING and "'SUPER_ADMIN','BURSAR','REGISTRAR'" in HARDENING,
    "payment insert policy is explicitly recreated": 'CREATE POLICY payment_insert ON payments' in HARDENING and 'current_setting(\'app.current_role\', true) = \'STUDENT\'' in HARDENING,
    "payment update policy is explicitly recreated": 'CREATE POLICY payment_update ON payments' in HARDENING,
    "payslip read policy is explicitly recreated": 'CREATE POLICY payslip_read ON payslips' in HARDENING and '"staffId" IN (SELECT id FROM staff' in HARDENING,
    "payslip manage policy is explicitly recreated": 'CREATE POLICY payslip_manage ON payslips' in HARDENING,
    "payslip update policy is explicitly recreated": 'CREATE POLICY payslip_update ON payslips' in HARDENING,
    "payment and payslip RLS remain enabled": 'ALTER TABLE payments ENABLE ROW LEVEL SECURITY;' in HARDENING and 'ALTER TABLE payslips ENABLE ROW LEVEL SECURITY;' in HARDENING,
    "partition hotfix preserves generated not-null metadata": 'conname NOT LIKE \'%_not_null\'' in PARTITIONS,
    "partition helper requires empty parents": "Fresh Neon partition baseline requires payments to be empty" in PARTITIONS and "Fresh Neon partition baseline requires payslips to be empty" in PARTITIONS,
    "historical receipt contract is represented": 'payment_receipt_claims' in MIGRATION and 'model PaymentReceiptClaim' in SCHEMA,
    "app role is explicitly non-bypass": 'NOINHERIT' in ROLES and 'rolbypassrls IS DISTINCT FROM false' in ROLES,
    "system role is explicitly bypass": 'BYPASSRLS' in ROLES and 'rolbypassrls IS DISTINCT FROM true' in ROLES,
    "role verification is fail-closed": 'role contract verification failed' in ROLES,
}

failed = [name for name, passed in checks.items() if not passed]
if failed:
    print("Fresh-Neon baseline contract validation failed:")
    for item in failed:
        print(f" - {item}")
    sys.exit(1)

print(f"Fresh-Neon baseline contract validation passed ({len(checks)} invariants).")
