# V43.12 Follow-up Forensic Notes

**Source attachment:** `/home/ubuntu/upload/pasted_content_13.txt`  
**Review date:** 15 August 2026  
**Comparison target:** V43.11 integrated-certification candidate

## Confirmed closed or downgraded findings

The attachment confirms fee-waiver concurrency, refresh-token atomicity, SUPER_ADMIN cap transactionality, fail-closed RLS misuse, deterministic reconciliation scheduling, distributed throttling, report-storage startup validation, safe redirects, LMS completed-student restrictions, LMS offering scope, response envelope, Redis health, invoice idempotency, result-amendment implementation, ResultVersion history, atomic result-to-CGPA updates, academic-plan single-active protection, academic-placement lifecycle, k6 fixture seeding, API E2E/integration test discovery, deployment static validation, and P1/P2 static contract checks.

Result amendment is implemented with old/new values, reason, actor, CGPA recalculation, audit, and outbox. Its remaining requirement is institutional authority/UAT, not missing source implementation.

## Highest-priority source findings to verify and repair

1. **DSR erasure ordering/FK defect.** `DataSubjectRequest.subjectUserId` remains User-bound. The erasure path may delete or pseudonymize User before creating the DSR, so hard-delete can violate the foreign key and the compliance record is not durable before destructive processing. The proper long-term solution is Person/DataSubject identity; a targeted interim repair must avoid returning success or silently losing the record.

2. **External verification worker false success.** JAMB/WAEC and other provider paths may log manual verification required and return normally, allowing BullMQ to mark the job completed without a durable explicit manual-verification work state. The correct interim behavior is an explicit durable `MANUAL_VERIFICATION_REQUIRED` outcome/event/queue item, not a fake provider success or blind retry storm.

3. **Registration-window fail-open and duplicated calendar logic.** Registration checks may skip enforcement if either open/close event is missing, ignore `endDate`, select one event when multiple periods exist, and drop-course uses separate date logic. The minimum safe repair is fail-closed when authoritative registration eligibility is indeterminate, honor event ranges, and centralize the policy helper for registration/drop.

4. **Graduation concurrency weakness.** Critical eligibility and clearance checks occur before transaction locking. Two requests could pass prechecks and both create graduation/alumni side effects. The transaction must acquire a student-level lock, reload and recheck status/candidate/eligibility/clearance under lock, then perform idempotent graduation/alumni/outbox writes.

## Other material residuals

RefundRequest/RefundExecution/RefundReconciliation/Chargeback/ledger domain is absent. Library and Hostel automatic clearance integration is explicitly incomplete. Person exists and Applicant/Student reference it, but privacy remains User-centric. Quiz attempts lack a server-side `expiresAt` timed-attempt model; high-stakes examinations must remain in the dedicated Exams domain unless strengthened. Assessment-to-result supports both evidence-derived and direct manual result paths and needs explicit result provenance categories and institutional policy. TeachingAssignment is absent. Migration baseline, provider lifecycle, real PostgreSQL RLS, academic/finance E2E, browser E2E, backup/restore, DR, load, queue recovery, clinic re-encryption, and institutional UAT remain live certification gates.
