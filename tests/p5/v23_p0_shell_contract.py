from pathlib import Path
import sys,json
root=Path(__file__).resolve().parents[2]
required=[root/"apps/web/components/erp/app-shell.tsx",root/"docs/V23_P0_PAGE_CONTRACTS.json"]
bad=[]
for p in required:
 ok=p.exists(); print(("PASS " if ok else "FAIL ")+str(p.relative_to(root)))
 if not ok: bad.append(p)
if bad: sys.exit(1)
