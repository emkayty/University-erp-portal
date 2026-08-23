#!/usr/bin/env python3
"""Verify that BYPASSRLS access remains limited to approved system paths.

This is intentionally static: it does not connect to or mutate a database. The
allowlist documents the current design boundary while leaving normal request
services on PrismaService/forRequest/RLS transactions.
"""
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[2]
API = ROOT / "apps/api/src"

DIRECT_IMPORT_ALLOWED = {
    "apps/api/src/database/prisma.service.ts",
    "apps/api/src/database/database.module.ts",
    "apps/api/src/database/direct-prisma.service.ts",
    "apps/api/src/modules/students/matric-number.service.ts",
    "apps/api/src/modules/admissions/admissions.service.ts",
    "apps/api/src/modules/users/users.service.ts",
}
RUN_SYSTEM_ALLOWED = {
    "apps/api/src/common/outbox/outbox.service.ts",
    "apps/api/src/modules/hr/hr-leave-restoration.scheduler.ts",
    "apps/api/src/modules/admissions/application-draft-cleanup.scheduler.ts",
    "apps/api/src/modules/fees/payments.service.ts",
    "apps/api/src/database/prisma.service.ts",
}

failures: list[str] = []
for path in sorted(API.rglob("*.ts")):
    if path.name.endswith(".spec.ts"):
        continue
    relative = path.relative_to(ROOT).as_posix()
    text = path.read_text(encoding="utf-8")
    if re.search(r"from ['\"][^'\"]*direct-prisma\.service['\"]", text) and relative not in DIRECT_IMPORT_ALLOWED:
        failures.append(f"unapproved DirectPrismaService import: {relative}")
    if ".runSystem(" in text and relative not in RUN_SYSTEM_ALLOWED:
        failures.append(f"unapproved PrismaService.runSystem call: {relative}")

if failures:
    print("DirectPrisma governance check FAILED")
    print("\n".join(f"- {failure}" for failure in failures))
    sys.exit(1)

print("DirectPrisma governance check passed")
print(f"approved direct-import paths: {len(DIRECT_IMPORT_ALLOWED)}")
print(f"approved runSystem paths: {len(RUN_SYSTEM_ALLOWED)}")
