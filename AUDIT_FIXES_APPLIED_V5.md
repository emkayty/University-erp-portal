# Audit Fixes Applied V5 — Admissions

Applied the complete admissions recommendations from the August 2026 review.

### P0/P1 reliability
- Fixed application capacity check-then-act race with advisory lock.
- Added database uniqueness for email/JAMB per admission cycle.
- Removed global email/JAMB uniqueness so legitimate reapplication in later cycles is possible.
- Added submission idempotency key to prevent duplicate submissions on retries/double-clicks.
- Made cycle activation transactional.
- Replaced approximate age calculation with calendar-based age.
- Added explicit admission-type/cycle consistency validation.

### Academic/business rules
- Added programme-specific admission requirements.
- Added O'Level minimum credits/sittings/English/Mathematics controls.
- Added programme subject requirements and alternatives.
- Added explainable screening results.
- Added review-required/incomplete concepts rather than forcing uncertain records into rejection.
- Added waitlist, deferment and clearance states.
- Added decision and offer records.

### Data model
- Person
- Application
- Address
- GuardianContact
- PreviousEducation
- OLevelSitting
- OLevelSubject
- ApplicationDocument
- AdmissionScreening
- AdmissionDecision
- AdmissionOffer
- AdmissionRequirement
- AdmissionSubjectRequirement

### User experience
- Public `/apply` journey.
- Public `/apply/status` journey.
- Open-cycle/programme discovery endpoints.
- Application completion percentage.
- Plain-language submission/status messaging.

### Security/privacy
- Public application rate limiting.
- Public status lookup rate limiting.
- Application status lookup requires both application number and application email.
- NIN is not collected in the public form.
- Academic decisions remain human-authorized.

### Integration
- Matriculation now updates both Applicant and Application status.
- O'Level staff entry synchronizes legacy JSON and normalized O'Level records.
- Status changes synchronize Application state and decision/offer history.
