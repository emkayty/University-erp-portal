# Admissions audit external sources

## Nigerian admissions workflow

1. JAMB CAPS — https://www.jamb.gov.ng/caps

JAMB describes CAPS as an automated tertiary-admissions process that gives institutions admission autonomy while keeping candidates informed about available choices and programmes. It supports candidate confirmation of provisional admission, handling of awaiting O'Level results, batch or instantaneous processing, and candidate status checking. This supports preserving a clear candidate-facing status journey, a candidate confirmation/acceptance step, and a manual fallback when external verification is unavailable.

## Nigerian disability inclusion and privacy

2. NDPC: Disability Details are Sensitive Health Data — https://ndpc.gov.ng/disability-details-are-sensitive-health-data-ndpc-warns-against-algorithmic-discrimination/

The Nigeria Data Protection Commission states that details of disabilities are sensitive personal data because they are health-related, and warns about discrimination risks. This supports collecting only the minimum support information needed, separating it from admissions merit decisions, restricting access, encrypting any free-text health information, and preventing automated ranking or rejection based on disability data.

3. NCPWD/ALGON Local Government Disability Framework — https://ncpwd.gov.ng/pdfs/23document.pdf

The framework describes disability inclusion, accessibility, reasonable accommodation, equal participation, and a twin-track approach that mainstreams inclusion while providing disability-specific support. It references Nigeria's Discrimination Against Persons with Disabilities (Prohibition) Act 2018 and the UN CRPD. This supports an accessible public application, alternative assisted-application channels, a dedicated support workflow, and a named institutional disability/accessibility function.

4. NUC: NCPWD Canvasses Provision for Physically Challenged in Nigerian Varsities — https://www.nuc.edu.ng/ncpwd-canvasses-provision-for-physically-challenged-in-nigerian-varsities/

NUC reports that NCPWD raised concerns about discrimination in Nigerian university admissions and requested attention to the needs of persons with disabilities in admission and curriculum processes. NUC described student-support facilities/services and redesign of programmes and physical facilities to accommodate persons with disabilities. This supports treating disability data as an accommodation/service signal rather than an admissions-disqualification field.

## Global accessibility and disability rights

5. W3C Web Content Accessibility Guidelines 2.2 — https://www.w3.org/TR/WCAG22/

WCAG 2.2 is the current W3C Recommendation used for accessible web content. It covers people with visual, auditory, physical, speech, cognitive, learning, neurological, and other disabilities. It defines perceivable, operable, understandable, and robust principles; testable success criteria; and newer requirements including focus visibility, target size, consistent help, redundant entry reduction, and accessible authentication. The repository's own UX contract targets WCAG 2.2 AA.

6. UN Convention on the Rights of Persons with Disabilities — https://www.ohchr.org/en/instruments-mechanisms/instruments/convention-rights-persons-disabilities

The Convention defines reasonable accommodation as necessary and appropriate modifications and adjustments needed to ensure equal enjoyment of rights, and recognizes accessibility, non-discrimination, universal design, privacy, and education. Articles 5, 9, 22, and 24 support accessible application technology, reasonable accommodation, privacy of disability information, and equal access to education.

## Global admissions platform pattern

7. UCAS disabled-student guidance — https://www.ucas.com/applying/applying-to-university/students-with-individual-needs/disabled-students-researching-your-choices

UCAS provides a separate disability/support pathway for applicants to research choices and discuss support with universities. A leading admissions design pattern is to keep support disclosure separate from the academic selection decision, explain why it is requested, and connect applicants with a disability or student-support adviser.

8. UCAS impairment/condition FAQ — https://www.ucas.com/faqs/if-i-tell-university-or-college-about-impairment-or-condition-will-it-affect-their-decision-my

UCAS guidance states that disclosing an impairment or health condition should not negatively affect the admission decision and exists to help arrange support. This supports an explicit non-discrimination statement and access controls that prevent disability data from appearing in academic-ranking screens.

## Repository evidence

9. UniPortal admissions domain design notes — repository file `docs/ADMISSIONS_DOMAIN_V5.md`

The repository already states that detailed medical information should stay out of the core application unless there is a documented purpose and appropriate privacy controls. It also distinguishes sensitive identity data from ordinary admissions fields.

10. UniPortal clinic service — repository file `apps/api/src/modules/clinic/clinic.service.ts`

The clinic module encrypts genotype, allergies, and chronic conditions; restricts access to the subject or clinic staff; excludes sensitive health fields from list views; and redacts them in audit logs. This is the appropriate internal precedent for any protected health-support workflow.

11. UniPortal UX standards — repository files `docs/V19_UI_UX_DESIGN_SYSTEM.md` and `docs/V19_UI_UX_QA_CONTRACT.md`

The repository requires grouped sections, inline validation, field help, required/optional distinction, safe drafts, review-before-submit, unsaved-change protection, clear recovery, 44px mobile touch targets, accessible labels, status announcements, error summaries, and loading/empty/populated/validation/server/offline/success/unsaved-change states. Critical QA explicitly includes applicant registration, application completion, and document upload.

## Audit-date note

The current system date is August 18, 2026. Nigerian admission thresholds and institutional requirements can change by admission cycle and programme, so UniPortal should expose them through institution-configured admission requirements and cycle-specific policy snapshots rather than hard-code one universal threshold. These findings are product and engineering guidance, not legal advice; the institution's Registrar, DPO/DPO-equivalent, disability-support lead, and counsel should approve final wording and retention periods.
