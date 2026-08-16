# UniPortal ERP live-staging certification runbook

## Purpose

This runbook executes the remaining infrastructure-dependent verification after the code-level repair. It is designed for an isolated staging environment and must not use production secrets or production data.

## Required services

Start the supplied `docker-compose.certification.yml` stack with PostgreSQL 16/pgvector, Redis 7, MinIO-compatible private storage, and Mailpit. The bootstrap command is:

```bash
export JWT_PRIVATE_KEY_B64='...'
export JWT_PUBLIC_KEY_B64='...'
export ENCRYPTION_KEY_HEX='...'
export SEED_ADMIN_EMAIL='admin@example.edu.ng'
export SEED_ADMIN_PASSWORD='use-a-staging-only-secret'
pnpm verify:cert-stack
```

The script intentionally fails if Docker or required secrets are absent. It does not generate credentials, seed an administrator, or infer payment credentials.

## Database and RLS certification

Run the complete migration chain against the empty certification database, bootstrap the restricted and system roles, seed only synthetic staging records, and run the API database/RLS integration suite. The role matrix must cover students, lecturers, HODs, deans, registrar, bursar, VC, DPO/support, and system workers. Negative tests must prove that cross-department result, fee, document, report, and student-record access is denied.

Validate migration `0043_academic_score_invariants` against existing rows before converting its `NOT VALID` constraints to validated constraints. Any legacy invalid score, weight, grade-point, or maximum-score row must be remediated by an approved data-migration script with an audit record.

## Queue and worker certification

Start API and worker processes separately. Force Redis outage, restart the worker, replay a duplicate outbox event, and verify at-least-once delivery with idempotent downstream effects. Confirm that failed events move through scheduled retries and that the tenth failure sets `deadLetteredAt` and raises an operational alert.

## Private storage certification

Create the configured bucket with private access only. Test presigned POST size and MIME conditions, oversized uploads, incorrect content type, object completion verification, unauthorized downloads, expiry, and deletion. An object is not academically authoritative until a trusted HEAD/stat check matches the expected key, size, and content type.

## Payment certification

Use provider sandbox accounts only. Test Paystack initialization, verified callback, duplicate callback, amount mismatch, currency mismatch, provider timeout, reconciliation after worker restart, reversal/refund handling, and ledger idempotency. Enable Remita only after the institution provides and validates its merchant-specific status endpoint, hash contract, status mapping, amount units, currency semantics, and sandbox evidence.

## Privacy certification

Use synthetic users with login, student, applicant, admission, audit, DSR, payment, LMS, document, clinic, hostel, and notification records. Test eligible erasure, academic/legal-hold pseudonymization, object deletion, audit traceability, DSR foreign-key integrity, and absence of recoverable PII in exports, metadata, object keys, notification bodies, and search indexes.

## Release decision

A successful local unit/build result is not enough. Approve a staging pilot only when the database/RLS, queue, storage, payment, privacy, browser, performance, backup/restore, and operational-alert gates produce retained evidence. Production approval additionally requires Registrar, Bursar, ICT/security, DPO, academic planning, admissions, and Senate-governance sign-off.

## References

[1]: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html "OWASP Forgot Password Cheat Sheet"

[2]: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html "OWASP Session Management Cheat Sheet"

[3]: https://redis.io/docs/latest/develop/programmability/eval-intro/ "Redis Lua scripting documentation"
