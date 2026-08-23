#!/usr/bin/env python3
"""Verify academic-evidence RLS uses the Student.userId identity bridge.

This check is intentionally static. It protects the db-push/post-schema
hardening path from regressing to a direct Student.id == User.id comparison.
It does not apply SQL or connect to a database.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
SQL = (ROOT / "scripts/db/apply-post-schema-hardening.sh").read_text(encoding="utf-8")

TABLE_POLICIES = {
    "academic_plans": "academic_plan_read",
    "academic_plan_items": "academic_plan_item_read",
    "degree_audits": "degree_audit_read",
    "progression_evaluations": "progression_evaluation_read",
    "academic_standings": "academic_standing_read",
    "academic_placements": "academic_placement_read",
}

DIRECT_STUDENT_BRIDGE = re.compile(
    r'"studentId"\s+IN\s*\(\s*'
    r'SELECT\s+s\.id\s+FROM\s+students\s+s\s*'
    r'WHERE\s+s\."userId"::text\s*=\s*'
    r"current_setting\('app\.current_user_id',\s*true\)",
    re.IGNORECASE | re.DOTALL,
)
PLAN_ITEM_BRIDGE = re.compile(
    r'"planId"\s+IN\s*\(\s*'
    r'SELECT\s+p\.id\s+FROM\s+academic_plans\s+p\s*'
    r'JOIN\s+students\s+s\s+ON\s+s\.id\s*=\s*p\."studentId"\s*'
    r'WHERE\s+s\."userId"::text\s*=\s*'
    r"current_setting\('app\.current_user_id',\s*true\)",
    re.IGNORECASE | re.DOTALL,
)

failures: list[str] = []
for table, policy in TABLE_POLICIES.items():
    if f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY" not in SQL:
        failures.append(f"{table}: RLS is not enabled in hardening script")
    if f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY" not in SQL:
        failures.append(f"{table}: FORCE RLS is not enabled in hardening script")

    start = SQL.find(f"CREATE POLICY {policy}")
    if start < 0:
        failures.append(f"{table}: read policy {policy} not found")
        continue
    next_policy = SQL.find("\nCREATE POLICY ", start + 1)
    block = SQL[start:] if next_policy < 0 else SQL[start:next_policy]
    bridge = PLAN_ITEM_BRIDGE if table == "academic_plan_items" else DIRECT_STUDENT_BRIDGE
    if not bridge.search(block):
        failures.append(f"{table}: read policy does not bridge the student record through students.userId")

if failures:
    print("Academic RLS identity governance check FAILED")
    print("\n".join(f"- {failure}" for failure in failures))
    sys.exit(1)

print("Academic RLS identity governance check passed")
print(f"verified protected tables: {len(TABLE_POLICIES)}")
