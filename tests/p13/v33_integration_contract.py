from pathlib import Path
import json,sys
root=Path(__file__).resolve().parents[2]
req=[
 root/"docs/V33_LEGACY_CONSUMER_MAP.json",
 root/"docs/V33_INTEGRATION_QA.md",
 root/"docs/V33_RELEASE.json",
 root/"apps/web/styles/v33-legacy-compat.css",
]
bad=[]
for p in req:
 ok=p.exists();print(("PASS " if ok else "FAIL ")+str(p.relative_to(root)))
 if not ok:bad.append(p)
if bad:sys.exit(1)
