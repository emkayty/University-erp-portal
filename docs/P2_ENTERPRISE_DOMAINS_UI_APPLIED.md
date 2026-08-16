# P2 Enterprise Domains — UI & Operations Pass

Applied to the P1 User Experience baseline.

## Changes

- Added a role-aware Learning/LMS workspace backed by the existing LMS API.
- Added explicit draft -> publish interaction for course content.
- Added course announcements.
- Added course-level loading/empty/error states.
- Added an Enterprise Operations orientation page linking users to existing enterprise domains.
- Added LMS and Enterprise Operations to dashboard navigation.
- Preserved API-side authorization as the security boundary.
- Avoided inventing dashboard counts or business outcomes when authoritative data is unavailable.
- Used deliberate publishing so unfinished learning content is not accidentally exposed.

## Remaining domain-depth work

The current API supports the workflows exposed here, but additional enterprise workflows should only be surfaced when their backend contracts exist. Examples include library acquisition workflows, hostel maintenance/inspection, richer research ethics-board workflows, alumni employment/events and advanced HR lifecycle actions.

Those should be implemented end-to-end (schema -> service -> controller -> authorization -> UI -> tests), not as UI-only mock features.
