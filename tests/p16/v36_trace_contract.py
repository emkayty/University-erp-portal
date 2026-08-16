from __future__ import annotations

import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[2]


def check(label: str, condition: bool, detail: str) -> bool:
    print(f"{'PASS' if condition else 'FAIL'} {label}: {detail}")
    return condition


results: list[bool] = []
required_docs = [
    root / 'docs/V36_CROSS_LAYER_WORKFLOW_CONTRACTS.json',
    root / 'docs/V36_TRACE_MATRIX.json',
    root / 'docs/V36_RUNTIME_TRACE_PLAN.md',
    root / 'docs/V36_CROSS_LAYER_REDFLAGS.json',
]
for path in required_docs:
    results.append(check('documentation', path.exists(), str(path.relative_to(root))))

notifications_controller = (root / 'apps/api/src/modules/notifications/notifications.controller.ts').read_text()
notifications_module = (root / 'apps/api/src/modules/notifications/notifications.module.ts').read_text()
results.append(check(
    'notifications API',
    "path: 'enterprise/notifications'" in notifications_controller
    and 'NotificationsController' in notifications_module
    and "@Patch(':id/read')" in notifications_controller,
    'versioned list and mark-read routes are registered',
))

api_client = (root / 'apps/web/lib/api-client.ts').read_text()
results.append(check(
    '204 response handling',
    "if (res.status === 204)" in api_client,
    'the shared client accepts no-content success responses',
))

payroll_page = (root / 'apps/web/app/dashboard/payroll/page.tsx').read_text()
results.append(check(
    'payroll download wiring',
    'apiClient.download(' in payroll_page and 'href={`/api/v1/payroll' not in payroll_page,
    'payroll exports use the authenticated client rather than native API links',
))

fetch_secrets = (root / 'scripts/deploy/hooks/fetch-secrets.sh').read_text()
terraform = (root / 'infra/data.tf').read_text()
env_schema = (root / 'packages/config/src/env.schema.ts').read_text()
results.append(check(
    'migration secret propagation',
    'MIGRATE_DATABASE_URL' in fetch_secrets
    and 'migrateDatabaseUrl' in terraform
    and 'MIGRATE_DATABASE_URL' in env_schema,
    'owner migration URL is produced, provisioned, and declared',
))

package_json = json.loads((root / 'package.json').read_text())
scripts = package_json.get('scripts', {})
results.append(check(
    'Prisma bootstrap wiring',
    scripts.get('prebuild') == 'pnpm db:generate'
    and scripts.get('pretype-check') == 'pnpm db:generate'
    and scripts.get('pretest') == 'pnpm db:generate',
    'build, type-check, and test regenerate Prisma client first',
))

sys.exit(0 if all(results) else 1)
