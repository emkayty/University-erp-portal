# V33 — Integration Validation

## Static
- No accidental native browser `confirm()` in new UI.
- Legacy classes are compatibility-only during migration.
- New components use `--u-*` tokens.
- No new glassmorphism or duplicate token systems.

## Runtime
- Build succeeds.
- Typecheck succeeds.
- Lint succeeds where configured.
- Critical routes render without console errors.
- No route has both legacy and V30 shell navigation simultaneously.

## Critical workflows
Admissions: review → decision → audit.
Registration: eligibility → conflict → submit → lock.
Exams: grade entry → upload preview → moderation → approval → publication.
Finance: invoice → payment → receipt → reversal/reconciliation.

## Mobile
320/360/390/430px, 768px and desktop.
No horizontal overflow; primary task completable.

## Security
Frontend permission controls never replace backend authorization.
Consequential operations are server-authorized and auditable.
