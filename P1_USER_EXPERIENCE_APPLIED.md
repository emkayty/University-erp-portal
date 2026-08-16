# P1 — User Experience Applied

This pass improves the web ERP around the existing P0 system-integrity baseline.

## Applied
- Replaced the static dashboard with role-aware, task-oriented landing pages.
- Added a responsive mobile navigation drawer.
- Exposed existing backend modules through role-filtered navigation instead of hiding major capabilities behind a short static menu.
- Added Academic Life as a common user-facing entry point.
- Added keyboard-friendly quick navigation (Cmd/Ctrl+K) without bypassing authorization; it only links to routes already permitted by the current role.
- Added clearer page context, breadcrumbs, role identity, accessible labels and consistent loading state.
- Added responsive layouts and larger touch targets.
- Added reduced-motion-compatible interaction behaviour through the existing design system.
- Added role-specific quick actions for students, registrar, dean, HOD, bursar, HR, staff, VC and super admin.
- Added explicit messaging around academic-record integrity and legitimate appeal/support channels.
- Avoided inventing KPI numbers, unread counts, notifications or financial balances when the current frontend has no authoritative data source.
- Preserved authorization at the backend: navigation visibility is a usability aid, not a security boundary.

## UX principles
1. Show users what they can do, not everything the ERP contains.
2. Put common tasks before administrative configuration.
3. Never manufacture business data merely to make a dashboard look populated.
4. Keep sensitive information out of broad dashboard summaries.
5. Make mobile navigation and keyboard navigation first-class.
6. Keep destructive/authoritative academic actions behind the existing backend authorization and workflow.
