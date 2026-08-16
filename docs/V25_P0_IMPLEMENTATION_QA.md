# V25 P0 Screen Migration QA

A P0 page is considered migrated only when:
- It uses the shared page shell.
- The primary task is obvious without hunting.
- Loading, empty, error and unauthorized states exist.
- Consequential actions have permission checks and confirmation where appropriate.
- Tables remain usable on narrow screens.
- Forms provide field-level validation and recovery.
- Sensitive data is minimized.
- Keyboard navigation and visible focus work.
- Existing backend/API/domain logic is preserved unless a separate domain fix is approved.

P0 order:
1. Dashboard
2. Admissions
3. Student
4. Course Registration
5. Exams & Results
6. Finance
