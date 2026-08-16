# V19 University ERP UI/UX Design System

## Design direction

The ERP should feel like a **calm university operating system**, not a generic admin template.

Core principles:
- task-first rather than menu-first;
- progressive disclosure;
- high information density without visual clutter;
- obvious next action;
- mobile-first responsive behavior;
- accessible by keyboard, touch and screen reader;
- consistent across admissions, academics, exams, finance and enterprise domains;
- role-aware without hiding important context;
- explainable automation;
- respectful handling of sensitive student/staff data.

## Visual language

Use a restrained professional visual language:
- neutral surfaces and generous spacing;
- one institutional accent plus semantic status colors;
- typography with clear hierarchy;
- compact tables with comfortable row height;
- cards only when they improve grouping;
- avoid excessive gradients, glassmorphism, decorative charts and oversized hero sections;
- avoid color-only status indicators;
- use icons as reinforcement, never as the only label.

## Information architecture

Primary navigation is role-aware but structurally stable:

1. Home
2. Admissions
3. Students
4. Academics
5. Exams & Results
6. Finance
7. People
8. Campus Services
9. Communication
10. Reports & Analytics
11. Administration
12. Audit & Compliance

Use contextual secondary navigation inside each domain.

## Role-oriented home

### Student
- current semester
- registration status
- outstanding actions
- timetable
- results
- fees
- notifications
- academic progress
- support

### Lecturer
- today's teaching
- courses
- class lists
- attendance
- assessment entry
- moderation/review tasks
- announcements

### Department/Faculty staff
- pending approvals
- registration exceptions
- result workflow
- student issues
- programme/curriculum tasks

### Registry/Admissions
- application pipeline
- verification queue
- missing documents
- decisions awaiting action
- conversion/enrolment status

### Finance
- receivables
- payment exceptions
- reconciliation queue
- approvals
- financial reports

### Administrator
- operational health
- approvals
- security alerts
- integration health
- audit events
- workflow backlog

## Page patterns

Every transactional page should have:

**Context → Status → Primary action → Supporting information → History/audit**

Examples:
- Applicant: identity + application status + next action + qualifications + documents + timeline.
- Student: identity + academic status + programme + quick actions + academic/financial summary.
- Course: course identity + current offering + capacity + prerequisites + assessment + history.
- Result: student/course/semester context + score breakdown + grade + workflow status + audit history.

## Tables

Tables are a primary ERP interface.

Required:
- sticky header;
- server-side pagination for large datasets;
- column visibility;
- sensible defaults;
- search/filter/sort;
- saved views for authorized staff;
- bulk selection only where safe;
- clear empty/loading/error states;
- row actions with explicit confirmation for consequential changes;
- responsive transformation on mobile rather than horizontal overflow whenever practical.

## Forms

Use:
- grouped sections;
- inline validation;
- field help;
- examples;
- required/optional distinction;
- dependent fields;
- autosave only for explicitly safe drafts;
- review-before-submit for consequential actions;
- unsaved-change protection;
- clear error recovery.

Never make users repeatedly type controlled institutional data when a validated selection exists.

## Mobile

Mobile is not a shrunk desktop.

On narrow screens:
- convert sidebars to drawers;
- keep primary action visible;
- transform dense tables into cards/details;
- use bottom-sheet filters;
- preserve search;
- use touch targets of at least 44px;
- avoid hover-only interactions;
- support portrait-first workflows.

## Accessibility

Target WCAG 2.2 AA principles:
- visible focus;
- keyboard navigation;
- semantic landmarks;
- accessible labels;
- sufficient contrast;
- status messages announced appropriately;
- reduced-motion support;
- no color-only meaning;
- error summaries for complex forms.

## Feedback model

Every mutation has:
1. immediate acknowledgement;
2. clear result;
3. next useful action;
4. audit/history where appropriate.

Errors should explain:
- what happened;
- why;
- what the user can do next;
- whether the action was saved.

## University-specific UX

Make academic and administrative states explicit:
- Draft
- Submitted
- Under Review
- Approved
- Rejected
- Published
- Locked
- Superseded
- Archived

Never use ambiguous labels such as "Done" for authoritative academic/financial states.

## Ethical/sensitive-data UX

For medical, disciplinary, financial and identity-sensitive data:
- minimize exposure;
- show sensitivity classification where useful;
- avoid unnecessary data in notifications;
- require elevated permission for disclosure;
- log consequential access;
- avoid shame-inducing language;
- distinguish "payment outstanding" from moralized wording.

## Distinctive product principle

The ERP's signature should be **"clarity under institutional complexity."**

Users should understand:
- where they are;
- what needs attention;
- why it matters;
- what they can safely do;
- what happens next.

That is the product's differentiation—not decorative styling.
