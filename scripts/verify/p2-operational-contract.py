#!/usr/bin/env python3
"""Static P2 operational and public-surface contract gate."""
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
ACADEMIC_ENGINE = (ROOT / "packages/utils/src/academic-domain-engine.ts").read_text()
ACADEMIC_TEST = (ROOT / "packages/utils/src/academic-domain-engine.spec.ts").read_text()
ADMISSIONS_DTO = (ROOT / "apps/api/src/modules/admissions/dto/admissions.dto.ts").read_text()
ADMISSIONS_SERVICE = (ROOT / "apps/api/src/modules/admissions/admissions.service.ts").read_text()
ADMISSIONS_CONTROLLER = (ROOT / "apps/api/src/modules/admissions/admissions.controller.ts").read_text()
STATUS_PAGE = (ROOT / "apps/web/app/apply/status/page.tsx").read_text()
PAYMENTS_CONTROLLER = (ROOT / "apps/api/src/modules/fees/payments.controller.ts").read_text()
E2E_RUNNER = ROOT / "scripts/test/run-e2e-hermetic.sh"
E2E_COMPOSE = ROOT / "docker-compose.e2e.yml"

checks = {
    "opaque tracking DTO": "trackingToken" in ADMISSIONS_DTO and "Length(64, 64)" in ADMISSIONS_DTO,
    "constant-time tracking verification": "timingSafeEqual" in ADMISSIONS_SERVICE and "createHmac" in ADMISSIONS_SERVICE and "sha256" in ADMISSIONS_SERVICE,
    "tracking fails closed without secret": "ADMISSIONS_TRACKING_SECRET" in ADMISSIONS_SERVICE and "ServiceUnavailableException" in ADMISSIONS_SERVICE,
    "public tracking throttled": "@Throttle({ api: { limit: 5, ttl: 60_000 } })" in ADMISSIONS_CONTROLLER,
    "status UI uses credential": "trackingToken" in STATUS_PAGE and "public/track" in STATUS_PAGE,
    "allocation search fail-safe": "ALLOCATION_SEARCH_LIMIT_REACHED" in ACADEMIC_ENGINE and "PENDING_REVIEW" in ACADEMIC_TEST,
    "adversarial allocation test": "bounded" in ACADEMIC_TEST and "overlap-" in ACADEMIC_TEST,
    "provider route skips request-wide transaction": "SkipRequestRlsTransaction" in PAYMENTS_CONTROLLER and "@SkipRequestRlsTransaction()" in PAYMENTS_CONTROLLER,
    "hermetic E2E runner": E2E_RUNNER.exists() and E2E_COMPOSE.exists(),
}

failed = [name for name, passed in checks.items() if not passed]
if failed:
    print("P2 operational-contract validation failed:")
    for item in failed:
        print(f" - {item}")
    sys.exit(1)

print(f"P2 operational-contract validation passed ({len(checks)} invariants).")
