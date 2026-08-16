from pathlib import Path
import json,sys
root=Path(__file__).resolve().parents[2]
required=[
 root/"apps/web/components/erp/v27-workflow-ux.tsx",
 root/"apps/web/components/erp/v27-workflow-ux.css",
 root/"docs/V27_UIUX_STANDARDS.json",
 root/"docs/V27_P0_ACCEPTANCE_MATRIX.json",
]
failed=[]
for p in required:
 ok=p.exists(); print(("PASS " if ok else "FAIL ")+str(p.relative_to(root)))
 if not ok: failed.append(p)
if failed: sys.exit(1)
