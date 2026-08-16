from pathlib import Path
import sys
root=Path(__file__).resolve().parents[2]
required=[root/'docs/V35_SECURITY_BOUNDARY_AUDIT.json',root/'docs/V35_ERP_API_DOMAIN_CONTRACT.json',root/'docs/V35_BACKEND_FRONTEND_CONTRACT_TESTS.json',root/'docs/V35_WIRING_CHECKLIST.json',root/'tools/forbid_browser_metadata_endpoint.py']
bad=[p for p in required if not p.exists()]
for p in required: print(('PASS ' if p.exists() else 'FAIL ')+str(p.relative_to(root)))
sys.exit(1 if bad else 0)
