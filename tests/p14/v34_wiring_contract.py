from pathlib import Path
import sys
root=Path(__file__).resolve().parents[2]
req=[root/'docs/V34_BACKEND_FRONTEND_WIRING_AUDIT.json',root/'docs/V34_API_ROUTE_INVENTORY.json',root/'docs/V34_BACKEND_FRONTEND_CONTRACT.json']
bad=[p for p in req if not p.exists()]
for p in req: print(('PASS ' if p.exists() else 'FAIL ')+str(p.relative_to(root)))
sys.exit(1 if bad else 0)
