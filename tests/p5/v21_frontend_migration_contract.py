from pathlib import Path
import sys
root=Path(__file__).resolve().parents[2]
required=[
 root/"apps/web/components/erp/ui.tsx",
 root/"apps/web/components/erp/data-surface.tsx",
 root/"apps/web/components/erp/confirm-action.tsx",
 root/"docs/V21_PAGE_MIGRATION_MATRIX.json",
]
bad=[]
for p in required:
 ok=p.exists()
 print(("PASS " if ok else "FAIL ")+str(p.relative_to(root)))
 if not ok: bad.append(p)
if bad: sys.exit(1)
