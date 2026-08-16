# P4 Intelligence Governance

## Purpose

P4 introduces deterministic rules and operational intelligence without turning the ERP into an opaque autonomous decision-maker.

## Human decision boundary

Automation may:
- detect missing information
- identify threshold breaches
- notify authorized staff
- create review tasks
- flag anomalies
- escalate operational exceptions

Automation must not silently:
- reject an applicant
- alter a grade
- change a student's academic standing
- suspend a student
- make a disciplinary finding
- change a fee/financial liability
- determine graduation eligibility
- override an authorized human decision

Those outcomes require the existing role/approval workflow and an auditable human action.

## Explainability

Every rule execution stores:
- rule identifier/version
- entity
- execution timestamp
- match result
- prepared actions

A staff user should be able to see why an item was flagged without exposing internal implementation secrets.

## Rule safety

Rules use a constrained operator set:
- eq
- neq
- gt
- gte
- lt
- lte

Do not use `eval`, arbitrary JavaScript expressions, SQL fragments, shell commands, or user-provided executable code as rule logic.

## Data minimization

Only facts necessary for a rule should be supplied to the rule evaluator. Sensitive data should not be copied into generic rule payloads unless the specific workflow requires it and access controls permit it.

## Fairness

Rules affecting students must be tested for:
- false positives
- false negatives
- unequal impact
- stale configuration
- exceptional cases
- appeal/review paths

A rule that produces repeated false positives should be paused, reviewed and versioned rather than silently tuned in production.

## Change control

A production rule should follow:

DRAFT -> review/approval -> ACTIVE -> PAUSED/RETIRED

Never edit an active rule in-place in a way that changes its historical meaning. Create a new version.
