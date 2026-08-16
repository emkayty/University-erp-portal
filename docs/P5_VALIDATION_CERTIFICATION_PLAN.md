# P5 Full ERP Validation & Certification Plan

This is a validation framework, not a claim that an external accreditation has been obtained.

## Authority and standards baseline

The ERP is validated against:
- Nigerian university operational expectations and NUC quality-assurance/accreditation concepts.
- The current ISO 21001:2025 Educational Organizations Management System standard.
- ISO/PAS 25171:2026 guidance for auditing ISO 21001:2025.
- General enterprise controls for authorization, auditability, data integrity, resilience and change management.

NUC remains the Nigerian regulatory authority for Minimum Academic Standards and programme accreditation. The software cannot itself certify an institution or programme.

## Critical invariants

### Identity
- One authoritative person identity.
- Student/staff accounts cannot cross data boundaries.
- Role changes are auditable.
- Deactivated accounts cannot authenticate.

### Admissions
- Application numbers are unique.
- Admission decisions require authorized workflow.
- No applicant can be admitted twice to the same intake/programme unless policy explicitly allows a controlled change.
- Supporting documents are versioned and auditable.
- Domestic address data supports Nigerian state/LGA relationships.
- Foreign applicants support country + region/province where applicable.
- Examination bodies/results use structured selections and controlled result verification.

### Academic structure
- Programme -> curriculum -> course -> course offering relationships are valid.
- Course codes are unique within the institutional scope.
- Prerequisites cannot reference impossible/self-conflicting structures.
- Curriculum versions are immutable once used for authoritative student progression, except through controlled versioning.

### Registration
- Registration obeys semester/session state.
- Student eligibility is checked before registration.
- Duplicate course registration is prevented.
- Credit limits and prerequisite rules are configurable.
- Overrides require authorized staff and an audit trail.

### Exams and grading
- Score components cannot exceed configured maximums.
- Final scores are calculated from configured assessment components.
- Grade boundaries come from institutional configuration.
- Nigerian 5.0 and American 4.0 scales are configuration-driven.
- Published results are immutable to ordinary staff.
- Corrections create an auditable revision, not silent overwrites.
- Bulk uploads validate every row before committing.
- Partial imports cannot silently corrupt authoritative results.
- Grade moderation/approval is separated from entry where policy requires it.
- Transcript/CGPA calculations use the correct institutional grading scheme.

### Graduation
- Eligibility is derived from authoritative curriculum, registration, results, credit and policy data.
- Manual overrides require explicit authorization and reason.
- Historical academic records are never deleted to make a student qualify.

### Finance
- Invoice/payment identifiers are unique.
- Payment webhook processing is idempotent.
- Reconciliation differences become review tasks.
- No client-side value can determine authoritative financial liability.

### Security/privacy
- Every privileged operation is authorization-checked server-side.
- Object-level access is enforced, not merely route-level access.
- Sensitive data is minimized in logs and exports.
- Audit records cannot be altered by ordinary users.
- Search never bypasses authorization.
- Documents have classification and controlled access.

### Infrastructure
- Health probes distinguish process liveness from dependency readiness.
- Backups have checksum verification.
- Restore procedures are tested.
- Integration delivery is idempotent.
- Notifications respect user preferences.
- Workflow creation is transactional.

## Certification statuses

Each requirement receives one:
- PASS — evidence demonstrates conformity.
- PARTIAL — implementation exists but evidence or edge cases remain.
- FAIL — behavior violates a required invariant.
- NOT VERIFIED — code exists but executable evidence is unavailable.
- NOT APPLICABLE — documented reason.

## Evidence required

A real certification run must retain:
- test output
- database migration output
- API integration results
- browser E2E recordings/screenshots where appropriate
- access-control test matrix
- backup/restore evidence
- performance measurements
- defect register
- approval/sign-off records

## Release gate

No production release if:
- a P0/P1 integrity or security defect is open;
- exam/result calculations are not reproducibly verified;
- financial reconciliation can be duplicated or bypassed;
- authorization tests fail;
- backup restoration has not been verified for the release where schema changes are material.
