# UniPortal ERP V43.13 — Follow-up Findings and Disposition

**Review date:** 15 August 2026  
**Input:** `pasted_content_14.txt`  
**Compared against:** V43.12 targeted-hardening source tree  
**Disposition:** Additional targeted repairs implemented; controlled staging candidate; not production-certified

## Independent review result

The supplied review independently confirmed the four V43.12 repairs and passed the static P1 academic-integrity, P2 operational-contract, and deployment-artifact gates. It correctly identified that the V43.12 source still contained a physical `User` deletion branch despite the schema’s explicit soft-delete contract and despite mandatory User-linked institutional records. It also confirmed that canonical Person identity was not yet available as a privacy intake path for pre-account applicants, and that calendar configuration accepted malformed registration periods.

## Targeted repairs implemented

| Finding | Repair in the revised candidate | Evidence |
|---|---|---|
| Physical User hard-delete loophole | `PrivacyService.erase()` no longer calls `tx.user.delete()` under any condition. Every erasure pseudonymizes the User, sets `isActive=false` and `deletedAt`, scrubs the subject’s historical audit payloads, and preserves referential integrity for notifications, incidents, DSR approvals, and other institutional records. The DSR audit metadata records `hardDeleteProhibited=true`; the response always reports `hardDeleted: false`. | Privacy tests now assert pseudonymization for a user with no academic identity or compliance history, and assert DSR-create → pseudonymization → DSR-finalization ordering. Source-level scan found no physical User-delete call in `apps` or `packages`. |
| Pre-account Person privacy gap | Added `POST /privacy/person/:personId/intake`, protected for DPO-scoped staff or SUPER_ADMIN. It creates a durable DSR linked to canonical `subjectPersonId`, links a unique Student User when one exists, leaves `subjectUserId` null for pre-account applicants, and uses `IDENTITY_VERIFICATION_REQUIRED` rather than falsely claiming completion. | Privacy tests cover both pre-account Person intake and the single linked User path. |
| Calendar configuration integrity | `CalendarService.addEvent()` now rejects event end dates before start dates, registration close events before any opening, duplicate same-type events at the same start date, multiple closes within one opening period, and an opening range that extends beyond its close. | Calendar tests cover reversed dates, close-before-open, duplicate registration events, and an open range extending past close. |

## Findings independently confirmed as closed

The review confirms that DSR creation precedes destructive processing, nullable DSR User linkage and canonical Person linkage exist, DSR lifecycle statuses are explicit, unavailable admissions providers create durable manual-verification work, registration operations fail closed, and graduation acquires a lock before rechecking all eligibility and clearance inputs.

## Remaining residual gates

The Person intake repair establishes durable identity-linked intake, not a claim that pre-account erasure, portability, or rectification has completed. Those operations still require verified identity workflow and a governed Applicant → Person processing implementation. The central academic-calendar policy engine remains an architectural improvement; other modules still require their own policy integration. Graduation clearance logic remains duplicated from the Clearance module and should eventually use a shared domain contract. Library, Hostel, Medical, ICT, Department, and Faculty clearance-provider integration remains incomplete.

RefundRequest/RefundExecution/RefundReconciliation/Chargeback and ledger reversal remain absent and are still a P1 finance gate. JAMB/CAPS and WAEC/NECO/NABTEB/NBAIS provider lifecycles remain live integration/certification requirements. Migration-baseline rehearsal, production migration/rollback, full PostgreSQL/RLS isolation, academic and finance lifecycle E2E, browser E2E, high-stakes assessment integrity, backup/restore, disaster recovery, queue recovery, load, clinic re-encryption, reporting topology, and institutional UAT remain open.

## Validation disposition

The revised source passed the focused privacy/calendar suites and API type-check, then passed the complete local gate: 33 API suites with 438 tests, 5 utility/package suites with 36 tests, 9 type-check tasks, lint, API and Next.js production builds, deployment-artifact validation, and Prisma schema validation using local placeholder database URLs. The expected outbox failure log emitted by a resilience test is test evidence, not a failed suite. The Next.js middleware-to-proxy message remains a non-blocking deprecation warning. The extracted project has no Git metadata, so source-level no-physical-delete and trailing-whitespace checks were used instead of `git diff --check`.

## Release posture

The revised candidate is suitable for controlled staging and pre-production certification rehearsal. It is not production-certified until live privacy identity/retention, finance refunds, provider lifecycles, PostgreSQL/RLS, migration, backup/restore, E2E, load, and institutional approval evidence are executed and signed.
