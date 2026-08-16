# P5 ERP Domain Validation Matrix

| Domain | Core checks |
|---|---|
| Auth & Users | RBAC, object-level authorization, session lifecycle, MFA, deactivation |
| Admissions | application lifecycle, documents, eligibility, decisions, Nigerian/foreign address data |
| Students | identity, lifecycle, status, programme ownership, data privacy |
| Curriculum | programme, curriculum versions, courses, prerequisites, credits |
| Registration | eligibility, duplicate prevention, credit limits, overrides |
| Exams | scheduling, eligibility, attendance, components, moderation |
| Grading | 5.0/4.0 scales, boundaries, calculation, corrections, publication |
| Results | approval, publication, transcript, CGPA, historical integrity |
| Fees | charges, invoices, payments, reconciliation, waivers, refunds |
| HR | staff lifecycle, authorization, leave, payroll boundaries |
| Library | catalogue, loans, returns, fines, access |
| Hostel | allocation, occupancy, status, clearance |
| Clinic | appointment, access control, medicine inventory, privacy |
| LMS | course content, announcements, enrolment scope |
| Research | projects, grants, outputs, governance |
| Transport | routes, allocations, safety records |
| Alumni | identity, consent, engagement, privacy |
| Audit | immutable evidence, actor, timestamp, before/after |
| Reports | authoritative sources, permissions, reproducibility |
| Search | relevance plus authorization filtering |
| Notifications | preferences, delivery state, retries |
| Integrations | idempotency, retry, failure isolation |
| Infrastructure | health, backups, DR, CI/CD, performance |
| Intelligence | explainability, human review, rule versioning, bias review |
