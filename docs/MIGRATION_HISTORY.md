# Prisma Migration History

## Purpose

Prisma records applied migrations by their complete directory names. Migration folders must therefore be treated as immutable once any environment has applied them. This registry documents irregular numeric prefixes and establishes the controlled convention for future migrations.

| Observed item | Status | Controlled handling |
| --- | --- | --- |
| Prefix `0021` is absent | Intentional historical gap | No migration is to be backfilled solely to make the sequence contiguous. The next functional migration must use the next approved prefix. |
| `0024_p5_reliability_integrity` and `0024_repair_admission_and_medical_contracts` share a prefix | Historical duplicate | Both directories remain unchanged. Prisma orders and records their complete directory names; rename neither after deployment. |

## Future migration rules

Every new migration must use a unique, monotonically increasing numeric prefix and a descriptive slug. Before applying a migration outside a disposable local database, the operator must review `prisma migrate status`, record the migration identifier in the release note, and verify the schema deployment backup/rollback plan. This policy prevents additional ambiguity while preserving all existing Prisma migration identities.
