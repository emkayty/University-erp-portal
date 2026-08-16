from pathlib import Path
import sys
root=Path(__file__).resolve().parents[2]
required=[
root/"apps/web/components/erp/v31-reliability-ux.tsx",
root/"apps/web/components/erp/v31-reliability-ux.css",
root/"docs/V31_HIGH_RISK_INTERACTION_CONTRACT.json",
root/"docs/V31_STATE_MODEL.json",
root/"docs/V31_PERFORMANCE_CONTRACT.json",
root/"docs/V31_CRITICAL_WORKFLOW_ACCEPTANCE.json",
]
failed=[]
for p in required:
 ok=p.exists();print(("PASS " if ok else "FAIL ")+str(p.relative_to(root)))
 if not ok:failed.append(p)
if failed:sys.exit(1)
