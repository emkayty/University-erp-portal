from pathlib import Path
import sys
root=Path(__file__).resolve().parents[2]
required=[root/"apps/web/components/erp/v32-confirm-dialog.tsx",root/"apps/web/components/erp/v32-confirm-dialog.css",root/"docs/INSTITUTIONAL_TERMINOLOGY.json",root/"docs/NIGERIAN_DATA_UX_RULES.json",root/"docs/HIGH_RISK_OPERATION_CHECKLIST.json",root/"docs/V32_LEGACY_MIGRATION_INVENTORY.json",root/"docs/V32_RELEASE.json",root/"tools/ui_qa_v32.py"]
bad=[]
for p in required:
 ok=p.exists();print(("PASS " if ok else "FAIL ")+str(p.relative_to(root)))
 if not ok:bad.append(p)
if bad:sys.exit(1)
