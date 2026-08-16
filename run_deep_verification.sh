#!/usr/bin/env bash
set -u
ROOT=/home/ubuntu/deep_audit
cd "$ROOT"
mkdir -p verification
run() {
  local name="$1"; shift
  echo "===== $name ====="
  set +e
  "$@" >"verification/${name}.log" 2>&1
  local code=$?
  set -e
  echo "$name exit=$code"
  tail -n 12 "verification/${name}.log" || true
  return 0
}
set -e
run install pnpm install --frozen-lockfile
run db_generate pnpm db:generate
run prisma_validate bash -lc 'cd apps/api && DATABASE_URL="postgresql://uniportal_app:pass@localhost:5432/uniportal" DATABASE_DIRECT_URL="postgresql://uniportal_system:pass@localhost:5432/uniportal" MIGRATE_DATABASE_URL="postgresql://uniportal:pass@localhost:5432/uniportal" pnpm prisma validate'
run type_check pnpm type-check
run build pnpm build
run lint pnpm lint
run tests_serial pnpm turbo run test --concurrency=1
run p1_integrity pnpm p1:verify-academic-integrity
run p2_operational pnpm p2:verify-operational-contract
run p4_rules pnpm p4:verify-rules
run p5_static pnpm p5:static-audit
run p5_contract pnpm p5:validate-contract
run p5_integration pnpm p5:integration-contract-audit
run route_contract pnpm --filter @uniportal/api test -- --runInBand route-contracts.spec.ts
printf '\nVerification logs are in %s/verification\n' "$ROOT"
