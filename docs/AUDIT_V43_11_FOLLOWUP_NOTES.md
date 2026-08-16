# V43.11 Follow-up Forensic Notes

**Source attachment:** `/home/ubuntu/upload/pasted_content_12.txt`  
**Review date:** 15 August 2026  
**Comparison target:** V43.10 candidate

## Confirmed closed findings

The attachment independently rechecked the V43.10 source and confirms that certification semantics, fee-waiver locking, atomic refresh-token rotation, fail-closed RLS misuse, SUPER_ADMIN cap transactionality, deterministic reconciliation IDs, Redis-backed throttling, report-storage startup validation, safe redirects, LMS permissions/scope, transactional outbox, invoice idempotency, report authorization, response envelopes, and Redis health are fixed and should not be carried forward as open defects.

It also corrects older claims by confirming that API E2E and integration test directories exist with `passWithNoTests: false`, and that the k6 performance fixture seeder exists and refuses production use. Published-result correction is implemented with amendment fields and result-version records; the remaining issue is institutional/UAT certification, not a missing implementation.

## Remaining findings

The main unresolved P1 gates are canonical Person/DataSubject identity, durable DSR lifecycle and status model, governed PII inventory/DSR export certification, complete refund domain and ledger, real Paystack/Remita lifecycle certification, JAMB/CAPS/WAEC/NECO/NABTEB/NBAIS certification and manual fallback evidence, PostgreSQL RLS cross-user/cross-scope/concurrent testing, full academic applicant-to-alumni E2E, finance-to-registration E2E, LMS-to-exam-to-result evidence, repeat/carryover/resit/interruption/resumption/programme-transfer E2E, degree-audit/graduation E2E, assessment-to-result traceability, published-result amendment UAT, high-stakes examination certification, clinic re-encryption evidence, browser E2E, backup/restore, DR/failover, real load/performance evidence, queue recovery/idempotency certification, and an immutable production migration baseline.

P2 gates are TeachingAssignment, centralized academic-calendar enforcement, policy-version history, reporting replica/topology, competency/outcome mapping, SIWES/practicum, accreditation/QA evidence, and advanced examination capabilities.

## Key recommendation

The next wave should not add generic features. It should focus on integrated runtime, academic, finance, provider, browser, backup/restore, load/DR, institutional UAT, and production sign-off. The one schema-level change still prioritized alongside refunds is decoupling DataSubjectRequest from User so pre-account Applicants remain representable as data subjects.

## Certification interpretation

Passing automated checks and reporting 426 API tests does not equal production certification. The repository correctly distinguishes automated gate passage from actual RLS, provider, browser, academic, financial, backup/restore, load, cloud, and institutional evidence.
