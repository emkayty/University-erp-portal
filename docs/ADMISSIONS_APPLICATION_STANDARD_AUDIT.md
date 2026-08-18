# UniPortal Public Admissions Application — Standards and Business-Logic Audit

**Audit scope:** Public admissions application, applicant evidence upload, candidate declaration, Nigerian academic workflow, disability and health-support disclosure, privacy, security, accessibility, and mobile usability.

**Repository reviewed:** `render-free-test`, including the public application page, admissions DTOs/controller/service, Prisma admissions schema, clinic privacy pattern, and the repository UX acceptance contracts.

**Audit posture:** The system has a strong admissions-domain foundation, but it is not yet a fully mature, low-friction, standards-grade application journey. The most important remaining issues are not cosmetic. They concern server-side enforcement, recovery after network failure, evidence completeness, versioned consent, disability-data separation, and accessibility of a large single-page form.

> This is an engineering, product, privacy, and workflow audit rather than legal advice. The Registrar, institutional DPO/DPO-equivalent, disability-support lead, clinic lead, and counsel should approve final policy wording, retention periods, and lawful bases before production use.

## Executive assessment

UniPortal already has several valuable controls: admission cycles, programme-specific requirements, Nigerian country/state/LGA references, JAMB and O'Level structures, duplicate detection scoped to an admission cycle, idempotency support, capacity locking, public status tracking, audit records, private object storage, AES-256-GCM NIN encryption, and a candidate declaration. It also now provides a visible passport-photo selector and a candidate terms-and-conditions checkbox.

The principal design weakness is that the browser is more complete than the server. The browser asks the candidate to choose a passport photograph, but `POST /api/v1/admissions/apply` does not receive or verify a photograph. A caller can bypass the browser and create an application without the required photo. Likewise, the server validates the declaration boolean but does not persist a terms version or a signed acceptance record. A high-stakes admissions system should treat the server as the authority and should not mark an application fully submitted until its policy-required evidence and acknowledgments are satisfied.

The second major weakness is the absence of a draft-and-resume journey. The current form is a long, single-page, single-shot submission with many fields and dependent reference requests. On a Samsung phone or an unstable Nigerian mobile connection, a refresh, browser eviction, network timeout, or accidental navigation can force the candidate to start again. The existing `Application` model has a `DRAFT` status and `lastSavedAt`, but the public application service creates a `SUBMITTED` application directly and does not expose a secure draft recovery mechanism.

The third major issue is disability and health information. The form should support reasonable accommodation, but it should not become an informal medical-history form. Disability details are health-related sensitive personal data according to the Nigeria Data Protection Commission, and global disability-rights principles emphasize accessibility, non-discrimination, privacy, and reasonable accommodation rather than medical disclosure as a condition of admission [3] [4]. The correct design is a minimal, optional support-request pathway separated from academic selection and protected like clinic data.

## Current strengths

| Area | Current strength | Assessment |
|---|---|---|
| Nigerian admissions | Admission cycle, type, programme choices, UTME/JAMB, O'Level sittings, controlled subjects, Nigerian state/LGA references | Strong foundation; needs more admission-type-specific detail and policy presentation |
| Academic rules | Programme/year-specific requirements, UTME cut-off, O'Level credits, English/Mathematics, maximum sittings, subject requirements | Good architecture; requirements should be visible before submission and snapshotted for the candidate |
| Security | Idempotency key, rate limiting, HMAC tracking token, advisory-lock capacity protection, private object storage, MIME/size checks | Good baseline; server-side required-evidence enforcement and anti-enumeration still need strengthening |
| Privacy | Encrypted NIN, masked staff responses, private photo key, clinic encryption precedent, erasure clearing | Good direction; consent evidence, support-data separation, retention, and access review need formalization |
| User experience | Reference-data selectors, LGA loading, searchable subject catalogue, photo preview, terms checkbox | Better than a paper-form clone; the long single-page journey remains stressful and fragile |
| Governance | Screening history, policy snapshot, application status lifecycle, audit records | Strong foundation; candidate-visible explanations and exception/manual-fallback states should be added |

## Critical gaps and loopholes

| Priority | Finding | Why it matters | Recommended control |
|---|---|---|---|
| **P0** | Passport photo is mandatory in the browser but not mandatory in the API | A hostile or simply different client can submit without a photo. The database can contain a `SUBMITTED` application that violates institutional policy | Move to a draft-first submission flow, or require a server-issued upload completion token in the final submit request. The server must verify the `PASSPORT_PHOTO` document before setting the application to `SUBMITTED` |
| **P0** | Application submission is single-shot; no secure save-and-return | A mobile refresh, timeout, lost tab, or weak connection can cause loss of hours of work and duplicate attempts | Add a draft token flow with hashed recovery token, email/OTP recovery, `lastSavedAt`, expiry, resume link, and explicit autosave status. Never store a raw draft token in the database |
| **P0** | Candidate agreement is a boolean without a versioned acceptance record | The institution cannot prove which terms, privacy notice, or declaration the candidate accepted | Persist `termsVersion`, `privacyNoticeVersion`, `acceptedAt`, and an immutable acceptance event. If policy permits, store a minimized audit context such as request ID and a privacy-reviewed device/IP fingerprint rather than unrestricted raw request data |
| **P0** | Duplicate-email conflict returns the existing `applicationNo` | This can disclose whether an email has applied and reveal an application identifier to anyone who knows the email | Return a generic message. Offer a verified recovery path that sends a status/resume link only after email or phone OTP verification |
| **P0** | Required documents are not shown early and are checked late in staff screening | Candidates can submit without knowing that a birth certificate, age declaration, result, transcript, or other programme-specific document will later block eligibility | Publish a cycle/programme-specific checklist before submission, show required/conditional documents, and block final submission only where the institution explicitly requires them at submission rather than at later review |
| **P0** | Disability/health information could be added directly to the core applicant record without separation | It risks discrimination, excessive access, accidental display in admissions lists, and inappropriate use in automated screening | Use a separate protected support-request record. Do not use disability or health data in eligibility, ranking, or rejection logic |
| **P1** | Completion percentage does not include the passport photo or document evidence and treats guardian information as a generic completion item | The candidate may see a misleading percentage. An adult candidate can lose completion points for an unnecessary guardian, while a photo/document requirement is not represented | Replace percentage-only reporting with section statuses: `Complete`, `Needs attention`, `Optional`, `Pending verification`. Calculate against the active cycle's actual policy and include photo/documents where required |
| **P1** | No review-before-submit page | The candidate cannot reliably inspect a long application before the consequential action | Add a review step with grouped read-only summaries, edit links, missing-field warnings, photo thumbnail, selected programmes, O'Level summary, privacy acknowledgments, and final confirmation |
| **P1** | Large single-page form has weak field-level accessibility | Static review shows few explicit `aria-*` relationships and no field-level error summary/scroll-to-error contract. Many labels do not visibly provide `htmlFor` IDs | Target WCAG 2.2 AA: explicit labels, `aria-describedby`, `aria-invalid`, field-level errors, error summary with focus, status announcements, visible focus, keyboard order, 44px touch targets, and screen-reader-friendly grouped controls [1] |
| **P1** | No offline/network recovery state for the application mutation | The candidate cannot distinguish “not saved”, “saved but photo pending”, and “unknown because the connection timed out” | Use a durable client submission ID, retry-safe status polling, a clear “we are checking whether your application was saved” state, and a recovery link rather than asking the candidate to submit again |
| **P1** | O'Level verification identifiers are not collected in the public form | The schema supports candidate number, examination number, and centre number, but the current form mainly collects body, type, subject, grade, year, and sitting. Manual verification can therefore require follow-up | Add candidate/examination/centre identifiers only when needed by the selected examination authority, with clear examples and privacy notices |
| **P1** | UTME/JAMB data is not sufficiently structured for real verification | Registration number and score are captured, but exam year, result state, verification reference, and candidate-authorized verification state are not part of the public journey | Add exam year and “result available/awaiting result” states, normalize input, show manual-verification fallback, and avoid claiming automated verification while the provider adapter is pending. JAMB CAPS itself is a multi-stakeholder process with candidate status and institutional approval stages [2] |
| **P1** | DE, transfer, postgraduate, sandwich, remedial, and international applications use essentially the same base journey | These routes have different evidence and academic histories. A generic form creates irrelevant questions and misses route-specific requirements | Drive the form from admission type: DE needs ND/NCE/HND details and transcript; transfer needs current institution and transfer reason; postgraduate needs degree, class/CGPA, transcript, research/work fields where relevant; international needs passport/visa/residency and international grading fields |
| **P1** | Photo upload has no server-side image-dimension, content-decoding, malware, or lifecycle control | MIME and byte checks do not prove that the body is a valid image or that the old replacement object is removed | Decode/re-encode images in a worker, enforce dimensions/aspect policy, malware-scan where feasible, reject polyglot/corrupt files, delete or lifecycle-expire replaced objects, and retain only the opaque key |
| **P1** | No application-fee or fee-policy presentation despite payment fields in the schema | If the institution charges a form fee, the candidate does not see amount, deadline, provider, receipt, waiver policy, or payment state before submission | Make fees configurable per cycle, show the total and waiver rules before payment, use Paystack/Remita idempotency and verified webhooks, and support a manual reconciliation state. If the institution has no fee, show “No application fee for this cycle” explicitly |
| **P2** | No formal alternative assisted-application channel | Some candidates will not complete a large form independently because of disability, connectivity, literacy, language, or device constraints | Publish accessible phone, email, in-person, and authorized-assistance routes. Record who assisted and what the candidate confirmed without exposing credentials |
| **P2** | No localization or plain-language mode | Nigeria is multilingual and applicants vary widely in digital literacy | Add plain-language help, Nigerian English examples, future translation support, and short explanations beside difficult academic terms. Never translate controlled academic names destructively |
| **P2** | No candidate copy/export of the submitted application | Candidates need evidence of what they submitted for correction, screening, and institutional support | Provide a privacy-safe PDF/HTML summary or downloadable receipt with no raw NIN and no full tracking token unless deliberately requested by the candidate |
| **P2** | No explicit correction/withdrawal route | Candidates can make genuine mistakes but have no governed way to request correction after submission | Add a correction window and controlled correction requests, preserving the original snapshot and an audit history. Do not silently overwrite authoritative submitted data |

## Disability and special-health-information design

### What not to add

Do not add a broad required field called **“special health problem”**, a diagnosis questionnaire, medication list, blood group/genotype, psychiatric history, or medical-record upload to the public admissions form. That would collect sensitive health data without a clear admissions purpose and would increase discrimination and breach impact. The repository's own admissions-domain notes already advise keeping detailed medical information out of the core application unless a documented purpose and appropriate controls justify it.

Do not make disability disclosure a condition for applying, admission, programme choice, scholarship ranking, or examination eligibility. A candidate may need support without wanting to disclose a diagnosis, and a reasonable-accommodation workflow should be focused on barriers and support rather than labels.

### What should be added instead

Add an optional section named **Accessibility and support needs**. The primary question should be:

> “Would you like the University to contact you about accessibility, examination support, or reasonable accommodation during the admissions process?”

Use `No`, `Yes`, and `Prefer not to say`. If the candidate selects `Yes`, show only the minimum operational questions:

| Field | Recommended options/purpose |
|---|---|
| Support needed for | Application form, entrance examination, interview, campus visit, communication, other |
| Requested support | Accessible venue, step-free access, extra time, rest breaks, reader/scribe, sign-language interpreter, captioning, large print, Braille, assistive technology, quiet room, accessible digital material, other |
| Short support description | Optional encrypted text, maximum 500 characters; ask what assistance is needed, not for a diagnosis |
| Preferred contact | Email, phone, SMS, or authorized representative |
| Preferred communication format | Plain language, large print, audio, sign-language support, other |
| Support consent | “I consent to the University Accessibility/Student Support Office contacting me about the support requested.” |
| Evidence | Do not require at application. If later necessary under an approved policy, request it through a separate private upload workflow with purpose, access, retention, and review explanation |

The user experience should explicitly say that the support request is **not used to decide academic eligibility** and will be shared only with the designated Accessibility/Student Support function and, where necessary, an approved examination or facilities team. It should also provide a contact alternative for applicants who cannot use the form.

### Recommended data model

Create a separate `ApplicantSupportRequest` or `ApplicationAccessibilityRequest` record rather than adding sensitive columns to `Applicant`:

| Field | Purpose |
|---|---|
| `id`, `applicationId` | Isolate the support case from academic identity data |
| `requested` | Whether the candidate wants contact/support |
| `supportAreas` | Controlled non-diagnostic categories |
| `requestedAdjustments` | Controlled operational accommodations |
| `supportDescriptionEncrypted` | Optional encrypted short text |
| `preferredContactMethod` | Operational follow-up |
| `consentAccepted`, `consentVersion`, `consentAt` | Evidence of purpose-specific consent |
| `status` | `REQUESTED`, `CONTACTED`, `ARRANGED`, `DECLINED`, `CLOSED` |
| `assignedSupportOfficerId` | Access-scoped ownership |
| `createdAt`, `updatedAt`, `closedAt` | Retention and audit |

The record must be excluded from applicant lists, public tracking, ordinary admissions exports, and automated screening. Access should be limited to a designated accessibility/student-support role, with clinic access only when a separate approved clinical purpose exists. The repository clinic service is the appropriate implementation precedent: encrypt sensitive fields, restrict access, exclude them from list responses, and redact audit content.

### Non-discrimination controls

Add automated tests and code-level policy guards stating that support-request fields cannot be read by the eligibility engine, cannot appear in admission-ranking inputs, cannot change a screening result, and cannot be used to reject or deprioritize an applicant. The application review screen should show admissions staff only a safe indicator such as **“Support request: follow-up required”**, with a controlled link to the support office—not the diagnosis or free-text content.

## Recommended user journey

| Step | Candidate experience | System behavior |
|---|---|---|
| 1. Choose application | Select cycle, admission type, programme choices | Show open dates, route, fee, minimum policy summary, and required/conditional checklist |
| 2. Create secure draft | Enter email/phone and receive recovery method | Create a draft token, hash it, rate-limit recovery, and show “saved” state |
| 3. Identity and contact | Personal data, nationality, origin, contact | Normalize and validate; avoid retyping controlled reference data |
| 4. Academic history | Dynamic UTME/DE/transfer/postgraduate/international fields | Only show relevant questions; preserve incomplete rows and explain why evidence is needed |
| 5. Accessibility support | Optional support request | Separate protected record; no academic effect; offer assisted route |
| 6. Documents and photo | Upload checklist with previews and per-file progress | Presign scoped objects, verify content, scan/re-encode, register metadata, and show pending/verified states |
| 7. Review | Read-only summary with edit links | Show errors, missing requirements, consent versions, photo, programme choices, and declaration |
| 8. Submit | One deliberate confirmation | Server verifies policy-required evidence and acceptance versions before changing status to `SUBMITTED` |
| 9. Receipt and tracking | Copy/download receipt; receive email/SMS if configured | Return application number once, issue tracking credential safely, and provide recovery without revealing identifiers |
| 10. Status journey | Submitted → Under review → Document review → Decision → Offer/next step | Expose candidate-safe explanations, deadlines, correction requests, and next actions |

## Business and governance improvements

### Programme-policy transparency

The public programme endpoint should return a candidate-safe requirement summary. It should not expose internal policy notes, but it should show the applicable UTME minimum, O'Level credit expectations, maximum sittings, required subjects, required documents, application fee, closing date, and whether awaiting results are accepted. Every submitted application should store a policy snapshot so a later policy edit cannot silently change the basis of the candidate's screening.

### Admissions exception handling

External verification must never become a dead end. JAMB, WAEC, NECO, NABTEB, payment providers, and object storage can be unavailable. The system should record `PENDING_EXTERNAL_VERIFICATION`, `MANUAL_REVIEW_REQUIRED`, provider reference, last attempt, next retry, and the responsible queue. Candidates should see “verification pending” rather than “rejected” when the institution has not yet received a reliable external result. JAMB CAPS describes a multi-stakeholder process with institutional officers, heads of institution, candidate confirmation, and status checking; UniPortal should reflect the same separation of roles [2].

### Candidate communication

Every important state transition should provide a clear next action: correct a field, upload a missing document, wait for verification, accept an offer, pay a fee, or contact a named office. Notifications must not include NIN, health details, full tracking credentials, or document contents. Messages should include application number only when appropriate and should provide a safe portal link.

### Data lifecycle

Define and implement retention schedules by data category. A passport photograph, NIN, support request, rejected document, audit record, and submitted application should not all have the same retention period. Add a documented legal-hold exception, candidate correction/withdrawal request process, secure object deletion, and verification that backups follow the same policy. The current privacy erasure service is a good foundation, but its behavior should be tested against drafts, submitted applications, support requests, photos, and audit/legal-hold cases.

## Accessibility and low-friction checklist

The repository already targets WCAG 2.2 AA. The admissions form should be tested against the following, not merely linted:

| Test | Expected behavior |
|---|---|
| Keyboard-only | Logical order, visible focus, no trapped focus, all select/file/checkbox controls usable |
| Screen reader | Every field has a programmatic label, instructions and errors are associated, progress and upload states are announced |
| 320–430px mobile | No horizontal overflow, 44px touch targets, primary action visible, no dense six-column O'Level row that becomes unusable |
| Low bandwidth | Reference data has loading/error/retry; draft saves are visible; upload progress and retry are clear |
| Offline/timeout | Candidate can determine whether data was saved and can safely resume without duplicate submission |
| Error recovery | Summary at top, focus moves to first error, field-level messages explain correction, entered data remains |
| Cognitive accessibility | Plain language, short sections, progress steps, examples, reduced duplicate entry, no unexplained codes |
| Colour/contrast | Meaning does not depend on colour; error and success have text and accessible status semantics |
| Assistive support | Alternative email/phone/in-person route and a clearly identified support contact |

## Prioritized implementation roadmap

### Release A — protect correctness and trust

1. Enforce required passport photo and required policy documents on the server before `SUBMITTED`.
2. Replace direct single-shot submission with a secure draft-and-resume foundation.
3. Add versioned terms, privacy notice, NIN consent, and support-consent evidence.
4. Remove `applicationNo` from duplicate-conflict responses until the candidate is verified.
5. Add a candidate-safe review screen and policy-specific checklist.
6. Add server tests for API bypass, photo omission, duplicate enumeration, replay, timeout, and terms-version mismatch.

### Release B — make Nigerian academic workflows complete

1. Add dynamic admission-type sections for UTME, DE, transfer, postgraduate, sandwich, remedial, and international candidates.
2. Add JAMB year/result state and O'Level candidate/examination/centre identifiers where applicable.
3. Add configured fee/no-fee presentation and payment/reconciliation states.
4. Add evidence upload status, missing-document explanations, provider verification fallback, and candidate correction requests.
5. Replace generic completion percentage with policy-aware section status.

### Release C — implement inclusion correctly

1. Add the separate optional accessibility/support request record.
2. Add controlled adjustment categories, encrypted support description, consent version, officer assignment, and access restrictions.
3. Ensure disability/support fields are excluded from eligibility, ranking, exports, public tracking, and ordinary admissions lists.
4. Add accessible application alternatives and a named support-office workflow.
5. Test with disabled applicants and assistive-technology users; do not rely only on automated scans.

### Release D — polish, resilience, and institutional maturity

1. Add translated/plain-language content, candidate receipt export, copy controls, and secure email/SMS notifications.
2. Add document malware scanning/re-encoding and old-object lifecycle deletion.
3. Add correction, withdrawal, data-subject request, retention, legal-hold, and breach-response controls.
4. Add admission analytics that use aggregated, access-controlled support data only for inclusion planning, never individual selection.
5. Add operational dashboards for verification queues, failed uploads, abandoned drafts, unresolved support requests, and candidate complaints.

## Final recommendation

Do **not** simply add a free-text field called “special health problem.” Add an optional, protected **Accessibility and support needs** workflow with non-diagnostic accommodation choices, a short encrypted explanation, purpose-specific consent, a dedicated support officer, and an explicit non-discrimination rule. At the same time, prioritize the server-side submission gate and draft-and-resume flow. Those two changes will remove the largest correctness loophole and the largest source of candidate stress.

The next engineering increment should be Release A, followed by the protected accessibility-support record in Release C. The current form is a promising foundation, but it should not be described as fully standards-compliant until these server, recovery, privacy, and accessibility controls are implemented and tested.

## References

[1]: https://www.w3.org/TR/WCAG22/ "W3C Web Content Accessibility Guidelines (WCAG) 2.2"
[2]: https://www.jamb.gov.ng/caps "Joint Admissions and Matriculation Board Central Admissions Processing System (CAPS)"
[3]: https://ndpc.gov.ng/disability-details-are-sensitive-health-data-ndpc-warns-against-algorithmic-discrimination/ "Nigeria Data Protection Commission: Disability Details are Sensitive Health Data"
[4]: https://www.ohchr.org/en/instruments-mechanisms/instruments/convention-rights-persons-disabilities "OHCHR Convention on the Rights of Persons with Disabilities"
[5]: https://ncpwd.gov.ng/pdfs/23document.pdf "NCPWD/ALGON Local Government Disability Framework"
[6]: https://www.nuc.edu.ng/ncpwd-canvasses-provision-for-physically-challenged-in-nigerian-varsities/ "NUC: NCPWD Canvasses Provision for Physically Challenged in Nigerian Varsities"
[7]: https://www.ucas.com/applying/applying-to-university/students-with-individual-needs/disabled-students-researching-your-choices "UCAS: Disabled students — researching your choices"
[8]: https://www.ucas.com/faqs/if-i-tell-university-or-college-about-impairment-or-condition-will-it-affect-their-decision-my "UCAS: Disclosing an impairment or condition"
[9]: https://github.com/emkayty/University-erp-portal/blob/render-free-test/docs/ADMISSIONS_DOMAIN_V5.md "UniPortal Admissions Domain V5 design notes"
[10]: https://github.com/emkayty/University-erp-portal/blob/render-free-test/apps/api/src/modules/clinic/clinic.service.ts "UniPortal ClinicService privacy pattern"
[11]: https://github.com/emkayty/University-erp-portal/blob/render-free-test/docs/V19_UI_UX_DESIGN_SYSTEM.md "UniPortal UX design system"
[12]: https://github.com/emkayty/University-erp-portal/blob/render-free-test/docs/V19_UI_UX_QA_CONTRACT.md "UniPortal UI/UX QA contract"
