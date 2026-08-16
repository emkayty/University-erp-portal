from pathlib import Path
import sys
root=Path(__file__).resolve().parents[2]
required=[
 root/"apps/web/components/erp/p0-interactions.tsx",
 root/"docs/V24_P0_UI_BLUEPRINTS.json",
 root/"docs/V24_P0_SCREEN_MIGRATION_CHECKLIST.md",
]
bad=[]
for p in required:
 ok=p.exists()
 print(("PASS " if ok else "FAIL ")+str(p.relative_to(root)))
 if not ok: bad.append(p)
if bad: sys.exit(1)
