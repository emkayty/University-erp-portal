from pathlib import Path
import sys
root=Path(__file__).resolve().parents[2]
required=[
    root/"apps/web/components/erp/ui.tsx",
    root/"apps/web/components/erp/navigation.tsx",
    root/"docs/V20_FRONTEND_IMPLEMENTATION_GUIDE.md",
]
failed=[]
for p in required:
    ok=p.exists()
    print(("PASS " if ok else "FAIL ")+str(p.relative_to(root)))
    if not ok: failed.append(p)
if failed: sys.exit(1)
