# V43.13 Follow-up Review Notes — Preliminary Classification

**Input:** `/home/ubuntu/upload/pasted_content_14.txt`
**Baseline:** V43.12 source tree and release archive
**Status:** Superseded by `docs/AUDIT_V43_13_FOLLOWUP_FINDINGS.md`, which records the final disposition and implemented repairs.

## Confirmed from the attachment and source

The attachment independently confirms the four V43.12 targeted repairs: DSR creation before erasure, nullable DSR User linkage plus canonical Person linkage, durable manual-verification state for unavailable admissions providers, fail-closed registration-window logic, and lock-first graduation concurrency. It also independently passed the P1 academic-integrity, P2 operational-contract, and deployment-artifact static gates. It did not execute the archived Jest suite because the release intentionally excludes `node_modules`.

The source currently still contains a physical-delete branch in `PrivacyService.erase()`. The branch computes `retainPseudonymized` from legal hold, Student, Staff, prior DSRs, and actor audit logs, then calls `tx.user.delete()` when false. The `User` model comment explicitly says `deletedAt` is a soft-delete field and “never hard-delete.” `NotificationLog.recipient`, `SecurityIncident.reportedBy`, `DataSubjectRequest.requestedBy`, and `AuditLog.actor` are direct User relations without a documented universal deletion policy in the inspected declarations. This is a valid high-risk finding requiring complete FK/deletion-policy analysis before changing behavior.

The source helper `resolveSubjectPersonId()` currently resolves only `Student.userId → Student.personId`. User has no direct `personId` field, and no Person-centric privacy entrypoint for pre-account Applicants was found in the inspected privacy service. This remains a genuine architecture gap, but its priority and scope need to be separated from the targeted V43.12 release repair.

The source still contains no RefundExecution, RefundReconciliation, Chargeback, RefundLedgerEntry, or refund service in the reviewed release line; this remains an open finance domain gate rather than a V43.13 incidental fix.

## Findings requiring further trace (historical working notes)

The next inspection must determine whether the hard-delete path is reachable in production routes, whether any additional User foreign keys are mandatory, whether existing account deletion policy requires physical deletion, whether calendar event creation validates ambiguous periods, whether graduation clearance duplication can be safely extracted without destabilizing module boundaries, and whether a focused V43.13 repair should be limited to eliminating physical User deletion plus adding adversarial calendar tests.
