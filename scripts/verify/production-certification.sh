#!/usr/bin/env bash
# Automated local/CI production-certification gate.
# Every automated command is mandatory: any failure terminates the run with a
# non-zero exit. A successful run is not, by itself, institutional production
# certification; independent runtime/provider evidence and release approval are
# still required by the final message below.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

required_vars=(
  DATABASE_URL MIGRATE_DATABASE_URL
  JWT_PRIVATE_KEY_B64 JWT_PUBLIC_KEY_B64 ENCRYPTION_KEY_HEX
  SEED_ADMIN_EMAIL SEED_ADMIN_PASSWORD
)
for name in "${required_vars[@]}"; do
  if [[ -z "${!name:-}" ]]; then
    echo "Certification requires ${name} to be set." >&2
    exit 2
  fi
done

if [[ "${NODE_ENV:-development}" == "production" && "${ALLOW_PRODUCTION_SEED:-false}" != "true" ]]; then
  echo "Controlled production bootstrap requires ALLOW_PRODUCTION_SEED=true." >&2
  exit 2
fi

echo '==> 1/11 Clean locked dependency installation'
pnpm install --frozen-lockfile --ignore-scripts

echo '==> 2/11 Environment and Prisma schema validation'
pnpm --filter @uniportal/api exec prisma validate
pnpm db:generate

echo '==> 3/11 Controlled fresh-schema deployment and RLS hardening'
DATABASE_AUTO_BOOTSTRAP_ROLES="${DATABASE_AUTO_BOOTSTRAP_ROLES:-true}" bash scripts/db/deploy-schema.sh

echo '==> 4/11 Explicit secure seed'
pnpm --filter @uniportal/api exec prisma db seed

echo '==> 5/11 Static type verification'
pnpm type-check

echo '==> 6/11 Unit and contract tests'
pnpm test

echo '==> 7/11 Integration, API end-to-end and provider-contract tests'
pnpm --filter @uniportal/api test:integration
pnpm --filter @uniportal/api test:e2e
pnpm --filter @uniportal/api test:pact:verify

echo '==> 8/11 Security and deployment topology checks'
pnpm p4:verify-rules
python3 scripts/verify/validate-deployment-artifacts.py

echo '==> 9/11 Production builds'
pnpm build

echo '==> 10/11 External-provider/runtime evidence gates'
bash scripts/verify/external-provider-certification.sh
bash scripts/verify/runtime-certification-evidence.sh

echo '==> 11/11 Automated certification gate passed'
echo 'Automated production-certification gate passed.'
echo 'Independent runtime/provider evidence is required before institutional production certification and release approval.'
