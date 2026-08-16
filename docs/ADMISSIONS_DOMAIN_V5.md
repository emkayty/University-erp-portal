# Admissions Domain V5 — Professional Nigerian University ERP

## Objective

Upgrade admissions from a simple Applicant/JAMB workflow into a reliable Applicant & Admissions domain while preserving backward compatibility with the existing `Applicant` record.

## Implemented

- Normalized `Person` identity record linked to applications.
- `Application` lifecycle separate from person identity.
- Programme choices 1–3.
- Programme-specific, academic-year-specific admission requirements.
- Configurable UTME cut-off, O'Level credit count, maximum sittings, English/Mathematics requirements, age bounds and subject requirements.
- Normalized O'Level sittings and subjects while retaining legacy JSON for compatibility.
- Previous education records for DE/transfer/postgraduate workflows.
- Application addresses and guardian contacts.
- Application document metadata and verification states.
- Screening history with policy snapshots and explainable reasons.
- Admission decision history and offer records.
- Waitlist, decline, deferment and clearance states.
- Application completion percentage.
- Calendar-correct age calculation.
- Duplicate email/JAMB detection scoped to an admission cycle rather than globally.
- Idempotent public application submission using `X-Idempotency-Key`.
- Advisory-lock protection for application capacity during high-concurrency opening periods.
- Public open-cycle and active-programme discovery.
- Public application status lookup with rate limiting.
- Public applicant-facing `/apply` and `/apply/status` journeys.
- Staff eligibility evaluation endpoint.
- Staff document verification endpoint.
- Atomic status → Application status → Decision/Offer synchronization.
- Matriculation synchronization to the Application lifecycle.
- Audit logging for requirement/document/application changes.
- Public application endpoint rate limiting.

## Data minimization

Sensitive fields are not added merely because they are traditionally present on paper forms. Religion, marital status and detailed medical information remain out of the core application unless a documented institutional purpose and appropriate privacy controls justify them.

NIN remains outside the public application form. Where identity verification is legitimately required, it should be performed in the controlled identity/verification workflow and never displayed unnecessarily.

## Admission decision principle

Automation assists screening; it does not replace institutional authority. The system records eligibility evidence, policy snapshots and reasons, while authorized academic/administrative officers retain decision authority.

## Important deployment note

The repository snapshot did not contain the earlier baseline Prisma migration directories, so `0018_admissions_domain_v5/migration.sql` is supplied as the incremental migration against the established production schema. Run Prisma validation/generation and migration deployment in an environment with the project's pinned dependencies before production rollout.
