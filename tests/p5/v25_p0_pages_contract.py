from pathlib import Path
import json, sys
root=Path(__file__).resolve().parents[2]
required=[
 root/"apps/web/components/erp/p0-pages.tsx",
 root/"docs/V25_P0_IMPLEMENTATION_SPEC.json",
 root/"docs/V25_P0_IMPLEMENTATION_QA.md",
]
failed=[]
for p in required:
    ok=p.exists()
    print(("PASS " if ok else "FAIL ")+str(p.relative_to(root)))
    if not ok: failed.append(p)
spec=json.loads((root/"docs/V25_P0_IMPLEMENTATION_SPEC.json").read_text())
for name in ["dashboard","admissions","student","course-registration","exams-results","finance"]:
    ok=name in spec and spec[name].get("states") and spec[name].get("rules")
    print(("PASS " if ok else "FAIL ")+name+" contract")
    if not ok: failed.append(name)
if failed: sys.exit(1)
