from pathlib import Path
import sys
root=Path(__file__).resolve().parents[2]
required=[
root/"apps/web/components/erp/v30-erp-shell.tsx",
root/"apps/web/components/erp/v30-erp-shell.css",
root/"docs/V30_SCREEN_QA_GATES.json",
root/"docs/V30_REAL_DEVICE_QA.md",
]
failed=[]
for p in required:
 ok=p.exists();print(("PASS " if ok else "FAIL ")+str(p.relative_to(root)))
 if not ok:failed.append(p)
if failed:sys.exit(1)
