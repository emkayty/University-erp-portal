from pathlib import Path
import json,sys
root=Path(__file__).resolve().parents[2]
required=[
 root/"apps/web/components/erp/v28-institutional-system.css",
 root/"apps/web/components/erp/v28-institutional-components.tsx",
 root/"docs/V28_NAVIGATION_MODEL.json",
 root/"docs/V28_ROLE_LANDING_MODEL.json",
 root/"docs/V28_UIUX_ACCEPTANCE.json",
 root/"docs/V28_DEPRECATION_MANIFEST.json",
]
failed=[]
for p in required:
 ok=p.exists(); print(("PASS " if ok else "FAIL ")+str(p.relative_to(root)))
 if not ok: failed.append(p)
if failed: sys.exit(1)
