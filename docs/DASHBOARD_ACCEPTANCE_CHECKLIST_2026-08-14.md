# Dashboard Acceptance Checklist

- [ ] Student dashboard returns only the authenticated student's snapshot.
- [ ] HOD dashboard is restricted to JWT department scope.
- [ ] Dean dashboard is restricted to JWT faculty scope.
- [ ] Finance dashboard exposes only finance-authorized metrics.
- [ ] HR dashboard exposes only HR-authorized workforce metrics.
- [ ] Executive dashboard is restricted to VC/SUPER_ADMIN authorization.
- [ ] No dashboard shows invented KPI values when an API call fails.
- [ ] Smart Summary text is derived only from returned values.
- [ ] Timetable/deadline cards use live sources and never fabricate events.
- [ ] Customization preferences do not contain sensitive profile data.
- [ ] Mobile layout is usable at 320px width.
- [ ] Keyboard focus is visible throughout the dashboard.
- [ ] Screen-reader labels exist for controls and dialogs.
- [ ] Reduced-motion behavior remains respected.
- [ ] Dashboard API passes authentication, authorization and RLS tests.
- [ ] Playwright accessibility suite passes.
- [ ] Production certification runner passes with real staging evidence.
