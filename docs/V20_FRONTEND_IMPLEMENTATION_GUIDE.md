# V20 Frontend Implementation Pass

V20 turns the V19 design contract into reusable frontend primitives.

## Standard page composition

Every authenticated transactional page should progressively converge on:

- `PageShell`
- page title + contextual description
- primary action
- filters/search
- primary data surface
- explicit loading/empty/error states
- status badges
- confirmation for consequential mutations
- audit/history where appropriate

## Component adoption priority

P0:
- authentication
- dashboard
- admissions
- student profile
- course registration
- exams/results
- finance/payment

P1:
- staff/HR
- library
- hostel
- clinic
- LMS
- research
- transport
- alumni

P2:
- reports
- administration
- settings
- integrations

## Interaction standards

No critical action may rely on:
- hover only
- icon only without an accessible label
- color only
- unexplained destructive confirmation

All forms must expose validation errors adjacent to the relevant field and provide a recovery path.

All long-running actions should expose progress or a clear queued/completed state.
