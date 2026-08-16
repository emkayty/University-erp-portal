from pathlib import Path
import json,sys
root=Path(__file__).resolve().parents[2]
required=[
 root/"apps/web/components/erp/v29-unified-ui.tsx",
 root/"apps/web/components/erp/v29-unified-ui.css",
 root/"docs/V29_WORKFLOW_MIGRATION_MATRIX.json",
 root/"docs/V29_MIGRATION_POLICY.md",
 root/"docs/V29_LEGACY_UI_SCAN.json",
]
failed=[]
for p in required:
 ok=p.exists(); print(("PASS " if ok else "FAIL ")+str(p.relative_to(root)))
 if not ok: failed.append(p)
matrix=json.loads((root/"docs/V29_WORKFLOW_MIGRATION_MATRIX.json").read_text())
for k in ["dashboard","admissions","student","course-registration","exams-results","finance"]:
 ok=k in matrix and len(matrix[k])>=5
 print(("PASS " if ok else "FAIL ")+k+" migration matrix")
 if not ok: failed.append(k)
if failed: sys.exit(1)
