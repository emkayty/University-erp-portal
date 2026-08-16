from pathlib import Path
import sys
root=Path(__file__).resolve().parents[2]
required=[
    root/"docs/V19_UI_UX_DESIGN_SYSTEM.md",
    root/"docs/V19_UI_UX_QA_CONTRACT.md",
    root/"docs/V19_FRONTEND_INVENTORY.json",
]
missing=[str(p) for p in required if not p.exists()]
print("V19 UI/UX contract:")
for p in required:
    print(("PASS " if p.exists() else "FAIL ")+str(p.relative_to(root)))
if missing: sys.exit(1)
