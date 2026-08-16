# V19 UI/UX QA Contract

## Responsive breakpoints

Validate every important workflow at:
- 320px
- 375px
- 390px
- 430px
- 768px
- 1024px
- 1280px
- 1440px+
- landscape mobile/tablet

## Interaction states

Every interactive page must provide:
- initial/loading
- empty
- populated
- validation error
- authorization denied
- server error
- offline/network failure where relevant
- success
- destructive confirmation
- unsaved changes

## Critical workflows

Run visual and interaction QA for:
- applicant registration
- application completion
- document upload
- admissions review
- student profile
- course registration
- timetable
- attendance
- assessment entry
- bulk grade upload
- result moderation
- result publication
- transcript
- fee payment
- payment reconciliation
- staff approval
- notification
- report generation

## Visual consistency

Reject:
- inconsistent button semantics;
- duplicate terminology;
- mixed date/number formats;
- uncontrolled free-text where reference data exists;
- icon-only critical actions;
- inaccessible dialogs;
- tables that become unusable on mobile;
- dashboards without actionable context;
- hidden errors;
- irreversible actions without confirmation and auditability.
