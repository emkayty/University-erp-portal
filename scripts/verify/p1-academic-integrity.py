#!/usr/bin/env python3
"""Static P1 contract gate for the academic-lifecycle hardening release."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
SCHEMA = (ROOT / "apps/api/prisma/schema.prisma").read_text()
MIGRATION = (ROOT / "apps/api/prisma/migrations/0027_academic_lifecycle_integrity_hardening/migration.sql").read_text()
ACADEMIC = (ROOT / "apps/api/src/modules/academic/academic.service.ts").read_text()
PAYMENTS = (ROOT / "apps/api/src/modules/fees/payments.service.ts").read_text()

checks = {
    "scoped academic policy model": "model AcademicPolicyVersion" in SCHEMA and "academic_policy_versions" in MIGRATION,
    "approved policy provenance": "approvedById" in ACADEMIC and "approvedAt" in ACADEMIC,
    "atomic academic plan lock": "academic-plan:${studentId}" in ACADEMIC and "pg_advisory_xact_lock" in ACADEMIC,
    "one active plan constraint": "uq_academic_plan_one_active_per_student" in MIGRATION,
    "structured unmet requirements": "unmetRequirementIds" in SCHEMA or "unmetRequirementIds" in ACADEMIC,
    "placement lifecycle": "academic_placements" in MIGRATION and "applyPlacement" in ACADEMIC,
    "approved exception provenance": "approvedById: { not: null }" in ACADEMIC and "approvedAt: { not: null }" in ACADEMIC,
    "payment initiation lease": "INITIATING" in SCHEMA and "initiationLeaseUntil" in PAYMENTS,
    "amount-bound idempotency": "different payment request, amount, or provider" in PAYMENTS,
    "global TSA receipt claim": "payment_receipt_claims" in MIGRATION and "paymentReceiptClaim" in PAYMENTS,
    "interruption completion": "resumeInterruption" in ACADEMIC and ("status: 'COMPLETED'" in ACADEMIC or 'status: "COMPLETED"' in ACADEMIC),
}

failed = [name for name, passed in checks.items() if not passed]
if failed:
    print("P1 academic-integrity contract validation failed:")
    for item in failed:
        print(f" - {item}")
    sys.exit(1)

print(f"P1 academic-integrity contract validation passed ({len(checks)} invariants).")
