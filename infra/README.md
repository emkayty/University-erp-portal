# UniPortal ERP — Terraform Infrastructure (P10)

Provisions the spec §19.1 Phase 1/2 architecture: VPC (2 AZ), RDS PostgreSQL 16
Multi-AZ + read replica, ElastiCache Redis 7 Multi-AZ, 3 S3 buckets,
CloudFront + WAF, EC2 Auto Scaling Group behind an ALB with CodeDeploy
blue/green, Secrets Manager, and SES.

## Bootstrap (one-time, before first `terraform init`)

A backend can't create its own storage, so create these by hand once per AWS
account:

```bash
aws s3api create-bucket --bucket uniportal-terraform-state --region us-east-1
aws s3api put-bucket-versioning --bucket uniportal-terraform-state --versioning-configuration Status=Enabled
aws dynamodb create-table --table-name uniportal-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST
```

## Apply

```bash
terraform init
terraform plan  -var-file=envs/staging.tfvars
terraform apply -var-file=envs/staging.tfvars
```

Required vars not given defaults: `environment`, `institution_slug`,
`frontend_origin`, `acm_certificate_arn` (must exist in **us-east-1** for
CloudFront regardless of `aws_region`). See `versions.tf` for the full list.

## What's deliberately NOT here

- **EKS / Phase 3 microservices** — spec §3.6 gates this behind "sustained
  CPU > 75% on EC2 monolith during peak hours despite vertical scaling."
  `compute.tf`'s `phase3_extraction_signal_alarm` watches for exactly that
  condition and is the intended trigger to start that work — it fires a
  CloudWatch alarm (planning signal), not a page.
- **S10 (API Gateway for Phase 3 service extraction)** — register item S10
  is prep work for the same not-yet-triggered event. What IS in place now,
  so the extraction is a routing change rather than a rearchitecture: the
  ALB's `/api/*` path-based routing (`storage_cdn.tf`) already isolates API
  traffic from static asset traffic, and `packages/types` already
  versions contracts per-module (`StudentV1`, `PayrollRunV1`, ...) rather
  than one monolithic type blob — extracting Results/Fees later means
  pointing a new ALB rule at a new target group, not renegotiating the
  contract shape. Provisioning an actual API Gateway resource now, with
  nothing behind it, would be dead infrastructure cost with no counterpart
  in the app.
- **GIFMIS (Federal TSA reconciliation API)** — per
  docs/CHANGELOG.md, this requires an institution-level onboarding
  agreement that doesn't exist yet. `fees.tsa-reconciliation` (built in
  P4) already covers the operational need via manual entry; there is no
  infrastructure to provision until that agreement exists.

## Secrets

Every `aws_secretsmanager_secret_version` in `iam_secrets_ses.tf` is seeded
with a `REPLACE_ME` placeholder (or a Terraform-generated bootstrap value
for the encryption key) and marked `lifecycle { ignore_changes =
[secret_string] }` — Terraform creates the _slot_ at the right path (spec
§7.5), a human populates the _value_ out-of-band, and future `terraform
apply` runs won't stomp on it. Rotate the encryption key via the v1/v2
dual-key procedure in `packages/utils/src/encryption.ts`, not by re-applying
Terraform.

## CodeDeploy vs. the existing SSH+pm2 deploy job

`.github/workflows/ci.yml`'s `deploy-staging`/`deploy-production` jobs
(built pre-P10, when no AWS infra existed yet) roll out via SSH + `pm2
reload`, which already fixed a real zero-downtime bug (see
docs/CHANGELOG.md H-P6-5). This Terraform adds a CodeDeploy
Application/DeploymentGroup so a proper AWS-native blue/green path (spec
§3.3, §19.3: canary 10% for 5 min, auto-rollback on alarm) is _available_.
`.github/workflows/deploy-aws-codedeploy.yml` is the new job that uses it.
Both paths currently exist side by side — cut over the `needs:` graph in
`ci.yml` once the CodeDeploy path has been exercised in staging a few times;
ripping out a working, bug-fixed deploy path in the same PR that introduces
its replacement is exactly the kind of unforced regression this project's
own evaluation discipline exists to catch.

## Database roles (audit remediation R2 — "RLS is decorative" — extended in P0-2, this pass)

Migration `0011_p10_rls_role_separation` splits what was previously a
single Postgres role (`uniportal`, the RDS master/bootstrap user — a
superuser) into two, and migration `0012_p10_system_role_bypass_rls`
(this pass) adds a third:

- **`uniportal`** — owner/bootstrap role. Used only by the guarded
  `scripts/db/deploy-schema.sh` workflow (via `MIGRATE_DATABASE_URL`) for
  non-destructive `prisma db push`, extension preparation, and RLS hardening,
  and by `data.tf`'s RDS master-user configuration. Never used by the running
  application; `prisma migrate deploy` is intentionally not supported on this
  release line.
- **`uniportal_app`** — the runtime role (`DATABASE_URL`). Non-superuser,
  does not own any table, NOBYPASSRLS, has only
  `SELECT/INSERT/UPDATE/DELETE`. This is what actually makes the RLS
  policies in migrations 0002/0005/0007/0008/0009 enforceable — Postgres
  exempts table owners **and superusers** from RLS regardless of `FORCE
ROW LEVEL SECURITY`, so as long as the app connected as `uniportal`, every
  policy was inert no matter what the application code did.
- **`uniportal_system`** — the `DATABASE_DIRECT_URL` role DirectPrismaService
  uses (advisory locks — see `apps/api/src/database/direct-prisma.service.ts`).
  Deliberately **BYPASSRLS**, unlike `uniportal_app`: this connection is used
  for narrow, system-level operations (matric number generation) that need
  to see every matching row regardless of which user triggered them, not a
  particular user's row-filtered view. Do not point any other connection at
  this role — see migration 0012's header comment for the full reasoning.

**Per environment, after migrations run once:**

```sql
ALTER ROLE uniportal_app WITH PASSWORD '<from Secrets Manager>';
GRANT CONNECT ON DATABASE <db_name> TO uniportal_app;
ALTER ROLE uniportal_system WITH PASSWORD '<from Secrets Manager, different value>';
GRANT CONNECT ON DATABASE <db_name> TO uniportal_system;
```

(Local development: run `pnpm db:bootstrap-roles` instead, which does the
equivalent of the above idempotently against the docker-compose Postgres
container — see the root README's Quick Start, step 5.5.)

This isn't in the migrations themselves (migrations shouldn't carry
credentials) and isn't yet automated in `iam_secrets_ses.tf` — doing that
properly means adding Secrets Manager entries + a one-time provisioning
step (e.g. a `terraform_data` resource with a `local-exec` `psql` call, or
an RDS Custom Resource in a follow-up PR) rather than hand-rolling it here
without being able to test it against a real RDS instance in this pass.
Track it before relying on this in a real AWS environment.

### Runtime RLS cutover

`uniportal_app` is now the intended runtime role. Protected Prisma model
getters route through the ambient request transaction when an authenticated
HTTP request is active, and through the dedicated `uniportal_system`
connection for trusted background/pre-auth operations. Direct raw SQL getters
follow the same rule. This prevents the previous silent-zero-row failure mode
when an unmigrated service touched a FORCE-RLS table outside `forRequest()`.

Before production cutover, run the full API test suite and a smoke test for
student self-service, result entry/publication, fee/payment flows, payroll,
course registration, reports, and security incidents. `uniportal_system` must
remain restricted to trusted infrastructure paths; ordinary application code
must never use it as a substitute for request authorization.
