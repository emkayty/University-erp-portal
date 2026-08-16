# Production Certification Evidence Template

The source repository cannot manufacture evidence for cloud/provider operations. Before production sign-off, the operator must replace each template with the actual executed evidence from the target environment.

Required files under `artifacts/certification/`:

- `rls-runtime-evidence.json` — restricted-role RLS tests, including cross-user denial and transaction-context isolation.
- `backup-restore-evidence.json` — backup creation, restore into an isolated database, checksum/count validation, and recovery time.
- `dr-failover-evidence.json` — controlled failover/failback, health verification, data-integrity checks and elapsed recovery time.
- `performance-evidence.json` — J1/J2/J3/general k6 results with target URL, commit SHA, dataset size, threshold results and timestamps.
- `ui-e2e-accessibility-evidence.json` — browser E2E, role-specific navigation, responsive checks and automated accessibility results.

Every JSON file must contain at least:

```json
{
  "executedAt": "2026-08-14T00:00:00Z",
  "result": "PASS",
  "environment": "staging",
  "commitSha": "...",
  "operator": "...",
  "notes": "..."
}
```

Provider sandbox evidence is separately recorded by `scripts/verify/external-provider-certification.sh` and must include an approved non-production payment lifecycle, webhook verification and reconciliation result before `PROVIDER_CERT_APPROVED=true` is supplied.
