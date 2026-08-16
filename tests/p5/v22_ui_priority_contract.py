from pathlib import Path
import sys
root=Path(__file__).resolve().parents[2]
required=[
 root/"apps/web/components/erp/dashboard.tsx",
 root/"docs/V22_HIGH_PRIORITY_UI_ACCEPTANCE.md",
]
bad=[]
for p in required:
 ok=p.exists()
 print(("PASS " if ok else "FAIL ")+str(p.relative_to(root)))
 if not ok: bad.append(p)
if bad: sys.exit(1)
