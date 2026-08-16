# UniPortal ERP v24 — Academic Lifecycle Hardening Implementation Report

**Release baseline:** `uniportal-erp-v24-academic-lifecycle-complete-2026-08-14.zip`  
**Integrated source location:** `uniportal-continue/uniportal`  
**Implementation date:** 14 August 2026  
**Prepared by:** Manus AI

## Executive summary

This implementation repairs the academic-lifecycle release blocker and integrates the forensic audit's high-risk academic correctness, transactional integrity, authorization, financial idempotency, testability, and deployment recommendations. The resulting release is designed for controlled staging deployment after migration `0027_academic_lifecycle_integrity_hardening` is applied.

The implementation deliberately distinguishes an **academic recommendation** from an **operationally applied decision**. A progression evaluation can recommend repeat placement or suspension, but only the separately privileged placement application operation changes a student level or status. This avoids a report silently becoming a sanction and creates an auditable approval boundary.

| Area | Implemented outcome |
| --- | --- |
| Academic compile failure | Prisma delegates and nullable requirement mapping corrected; full monorepo type checks pass. |
| Degree audit correctness | Approved exemptions, substitutions, transfer credits, and current equivalencies are mapped into deterministic audit inputs and recorded in audit evidence. |
| Policy-driven progression | Versioned, scoped academic policies resolve by programme, department, faculty, then institution; invalid or missing rules fail closed. |
| Standing history | Prior official standings are loaded into consecutive-probation evaluation. |
| Plan integrity | Audit creation, plan supersession, and replacement plan creation share an advisory lock and one transaction; the database enforces one active plan per student. |
| Operational decisions | Recommended placements are independently applied by a Registrar/Super Admin and course registration consults applied placements. |
| Lifecycle workflows | Appeals, programme transfers, interruptions, credentials, and revocations now have validated endpoint, authorization, transactional decision, and audit paths. |
| Payment safety | Provider requests reserve a durable `INITIATING` row before external I/O; TSA receipts use a global immutable claim registry. |
| Test and CI discipline | Academic regression tests, updated payment tests, Playwright/Jest separation, and disposable E2E infrastructure were added. |

## Implemented remediations

### Academic policy and degree-audit integrity

A new `AcademicPolicyVersion` persistence model separates machine-readable academic rules from the existing narrative university-policy publication workflow. It supports active policies at institution, faculty, department, or programme scope, with deterministic precedence and explicit priority. Both progression and academic-standing evaluations now resolve active scoped policies, validate the rule definition, and store the selected policy version plus its immutable rule snapshot in the decision record.

Degree audits now query only approved academic exemptions, substitutions, and transfer credits, together with currently effective course equivalencies. The persisted audit snapshot retains the source identifiers for each exception class. This permits later evidence review without recomputing against changed data. A new governed `AcademicSubstitution` table provides the previously missing persistence source for substitutions.

### Progression, standing, placement, and registration

The progression service obtains prior standing records in chronological sequence instead of passing an empty history. It creates at most one evaluation and standing per student, academic period, and selected policy version. When an outcome is not eligible or suspension is recommended, the service creates a `RECOMMENDED` `AcademicPlacement`; this record does not alter a student automatically.

The dedicated placement application operation is limited to `SUPER_ADMIN` and `REGISTRAR`. It atomically updates the student level and operational status, then marks the placement `APPLIED`. Registration permits `ACTIVE` and official `REPEATING` students but blocks any applied suspension placement. Generic `STAFF` was removed from sensitive academic journey, audit, and progression endpoints to align the HTTP contract with the restrictive RLS design.

### Atomic plans and canonical outstanding requirements

Each degree audit now obtains a transaction-scoped PostgreSQL advisory lock on the student plan key. Within that same transaction, it creates the audit record, supersedes earlier active plans, and creates the successor plan. Migration `0027` also creates a partial unique index that limits each student to one `ACTIVE` plan.

The journey summary and plan derive outstanding courses from the degree engine's canonical unmet-requirement output. The former failed-result-only fallback remains only for historical audit snapshots written before this release; it is never used to create a new plan.

### Lifecycle workflow completion

The academic module now includes DTO validation and audited workflows for the formerly schema-only lifecycle entities.

| Workflow | Student action | Authorized decision/application |
| --- | --- | --- |
| Academic appeal | Submit a typed appeal with optional evidence reference. | Registrar, Dean, HOD, or Super Admin records a single approved/rejected decision. |
| Programme transfer | Submit one open transfer request. | Registrar or Super Admin approves/rejects; approval atomically updates programme, department, and active target curriculum. |
| Academic interruption | Submit a dated interruption request. | Registrar or Super Admin approves/rejects; approval marks the student deferred. |
| Credential | No student self-issue path. | Registrar or Super Admin issues only to a graduated student; revoke requires an auditable reason. |
| Academic placement | Created from progression where needed. | Registrar or Super Admin separately applies it to the operational student record. |

### Payment idempotency and TSA receipt protection

Payment initiation no longer checks, releases a lock, calls a provider, and then persists. It now creates or resumes a durable `INITIATING` payment record while holding the idempotency-key advisory lock. The row has a short lease, so a concurrent request receives an in-progress response rather than creating a second provider instrument. The persisted payment ID produces deterministic Paystack and Remita request identities. Provider failures mark the same staged row `FAILED`; a later retry with the same key resumes it.

Because the payments table is partitioned and cannot enforce global uniqueness on a provider reference, manual TSA/GIFMIS payments now claim their normalised receipt in the unpartitioned `payment_receipt_claims` registry before a payment is created. The claim is unique and survives payment partitions, eliminating duplicate receipt recording. Legacy payments are also checked before a claim is made.

## Database migration and configuration requirements

Apply migration `0027_academic_lifecycle_integrity_hardening` after the existing `0026_academic_lifecycle_completion` migration. It adds academic-policy versions, policy provenance columns, placement lifecycle fields, a partial active-plan uniqueness constraint, academic substitutions, the payment `INITIATING` status/lease, and TSA receipt claims.

Before enabling progression in staging or production, create and activate at least two scoped policy records applicable to each programme context. The exact `ruleDefinition` payloads must follow this contract.

```json
{
  "policyType": "PROGRESSION",
  "scope": "PROGRAMME",
  "scopeId": "<programme-uuid>",
  "priority": 0,
  "ruleDefinition": {
    "minCreditUnitsToProgress": 18,
    "minCgpaForUnconditionalProgress": 2.0,
    "maxCarryoversForConditionalProgress": 2,
    "conditionalProgressionAction": "PROMOTE_WITH_CARRYOVER"
  },
  "approvalStatus": "ACTIVE"
}
```

```json
{
  "policyType": "ACADEMIC_STANDING",
  "scope": "PROGRAMME",
  "scopeId": "<programme-uuid>",
  "priority": 0,
  "ruleDefinition": {
    "probationCgpaThreshold": 1.0,
    "warningCgpaThreshold": 2.0,
    "consecutiveProbationPeriodsForSuspension": 2
  },
  "approvalStatus": "ACTIVE"
}
```

> Do not rely on former hard-coded thresholds. Missing, inactive, malformed, or out-of-scope policy configuration causes the progression operation to reject rather than producing an unauditable decision.

## Verification evidence

| Verification gate | Result |
| --- | --- |
| Prisma client generation | Passed with Prisma 6.19.3. |
| Prisma schema validation | Passed with required syntactic connection variables. |
| Monorepo type checking | Passed: 9 tasks. |
| Targeted AcademicService suite | Passed: 3 tests. |
| Expanded PaymentsService suite | Passed: 24 tests. |
| Full monorepo unit and contract suite | Passed: 341 API tests, 34 utility tests, all tasks successful. |
| Dynamic-code tripwire | Passed. |
| Deployment artifact validation | Passed. |
| Production build | Passed: API and optimized Next.js web build. |
| Hermetic E2E runner syntax | Passed. |
| Hermetic E2E execution in this sandbox | Not run: Docker is unavailable in the sandbox. |

## Remaining controlled release gates

The source-level repair and non-database tests do not replace environment evidence. Before any production release, run `pnpm test:e2e:hermetic` on a Docker-capable MacBook, CI runner, or deployment environment, then execute real PostgreSQL/RLS role-matrix tests, concurrent payment/provider sandbox checks, migration rehearsal from a production-like backup, load testing, and backup/restore certification.

The provider integrations also remain dependent on institution-owned credentials and signed merchant contracts. Remita RRR generation and status verification must be validated against the university's actual merchant product endpoints before live settlement is enabled.

## Primary changed files

| File or component | Purpose |
| --- | --- |
| `apps/api/src/modules/academic/academic.service.ts` | Atomic degree audit, policy-driven progression, placement application, and lifecycle workflows. |
| `apps/api/src/modules/academic/academic.controller.ts` | Role-scoped academic and lifecycle endpoints. |
| `apps/api/src/modules/academic/dto/academic-lifecycle.dto.ts` | DTO validation for lifecycle requests and decisions. |
| `apps/api/prisma/schema.prisma` | Academic policy, substitution, placement, payment-lease, and receipt-claim models. |
| `apps/api/prisma/migrations/0027_academic_lifecycle_integrity_hardening/migration.sql` | Append-only database integrity migration. |
| `apps/api/src/modules/fees/payments.service.ts` | Durable provider initiation and TSA receipt claims. |
| `apps/api/src/modules/students/students.service.ts` | Applied-placement course-registration gate. |
| `apps/api/src/modules/academic/academic.service.spec.ts` | New academic lifecycle regression coverage. |
| `docker-compose.e2e.yml` and `scripts/test/run-e2e-hermetic.sh` | Disposable PostgreSQL/Redis E2E test environment. |

## References

[1] [Original forensic audit report](../../../FORENSIC_AUDIT_REPORT.md)  
[2] [Production certification gate definition](CERTIFICATION_GATES.md)  
[3] [External integration certification gate](EXTERNAL_INTEGRATION_CERTIFICATION.md)


## P1 continuation hardening

A second source-level review identified additional correctness edges and closed them before re-release. The degree engine now emits structured unmet requirement identifiers, allowing unsatisfied elective requirements to flow into the plan without relying on human-readable compulsory-course strings. Generic elective baskets that have no course-level identifiers remain visible as explicit unresolved review groups rather than being misrepresented as zero outstanding courses.

Exception and policy ingestion now requires approval provenance and restricts records to the student's current curriculum/course catalog. Payment idempotency binds a key to the requested amount as well as fee, student, and provider. Eligible, conditional, repeat, and suspension outcomes all produce explicit recommended placements, while previously persisted evaluations without placements are backfilled transactionally. Approved interruptions now have a controlled resumption operation that restores a deferred student only after the interruption end date. Current journey, audit, and plan reads are scoped to the student's current curriculum version.

The new `p1:verify-academic-integrity` command validates 11 static invariants spanning policy provenance, atomic plan locks, active-plan uniqueness, structured unmet requirements, placement lifecycle, approved exceptions, payment initiation leases, amount-bound idempotency, TSA claims, and interruption completion.


## P2 operational hardening

The P2 pass replaces email-based public application status proof with a 64-character HMAC-derived tracking credential. The credential is returned once with a successful application submission, is never stored as plaintext, and is verified with constant-time comparison. Public tracking returns a generic failure for invalid credentials, remains throttled, and the applicant-facing status page now asks for the credential rather than an email address. The API fails closed when `ADMISSIONS_TRACKING_SECRET` is absent or too short.

The academic allocator now fails safe when its bounded overlapping-basket search budget is exhausted. Unresolved groups are marked reviewable and the audit status becomes `PENDING_REVIEW`, preserving structured requirement identifiers for authorized manual resolution. The provider-initiation route retains its explicit request-wide RLS transaction skip contract because it performs bounded external I/O between protected local reservation and final persistence; the P2 contract gate and deployment guide document this as a deliberate pool-protection boundary.

Validation additions include the P2 operational contract gate and adversarial allocation, valid-token, invalid-token, and submission-secret regression tests.
