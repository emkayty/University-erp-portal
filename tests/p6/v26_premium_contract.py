from pathlib import Path
import json, sys
root=Path(__file__).resolve().parents[2]
required=[
 root/"apps/web/components/erp/v26-premium.css",
 root/"apps/web/components/erp/premium-primitives.tsx",
 root/"docs/V26_ROLE_UX_MODEL.json",
 root/"docs/V26_PREMIUM_QUALITY_GATES.json",
 root/"docs/V26_PREMIUM_RELEASE.md",
]
failed=[]
for p in required:
    ok=p.exists()
    print(("PASS " if ok else "FAIL ")+str(p.relative_to(root)))
    if not ok: failed.append(p)
if failed: sys.exit(1)
