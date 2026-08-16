# University Policy Management and Configuration Guide

## Purpose

UniPortal now provides two complementary governance controls. **University Configuration** holds operational settings that immediately influence academic, finance, security, branding, messaging, and feature behavior. **University Policies** holds versioned institutional policy documents that follow a controlled lifecycle: draft, independent review, publication, acknowledgement, revision, and archive.

> **Do not treat the policy workspace as a substitute for Senate, Council, management, legal, NUC, labour, or data-protection approval.** It records and distributes the approved institutional text; the university remains responsible for the authority and approval record behind it.

## Administrator entry points

| Workspace                | Route                         | Intended purpose                                                                                                      |
| ------------------------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| University Configuration | `/dashboard/settings`         | Configure institution identity, finance, academic defaults, security, email capacity, and controlled module switches. |
| University Policies      | `/dashboard/policies`         | Create, approve, publish, revise, archive, and report acknowledgements of policy documents.                           |
| API settings             | `/api/v1/settings`            | Programmatic administration of institution settings.                                                                  |
| Policy API               | `/api/v1/university-policies` | Programmatic policy lifecycle and acknowledgement API.                                                                |

## University configuration controls

The expanded Settings page exposes the following implementation-backed controls.

| Control area                   | Settings                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Institution identity and brand | Name, code, type, official web/email/phone details, currency, logo URL, favicon URL, primary colour.                                                                           |
| Financial operation            | TSA mode and HOD/Bursar waiver authority limits. HOD authority must remain lower than Bursar authority.                                                                        |
| Academic rules                 | Nigerian 5-point or US 4-point scale, repeat-course calculation policy, credit-unit bounds, CA/final assessment weights, result validation, Dean approval, and live gradebook. |
| Security                       | Mandatory MFA roles.                                                                                                                                                           |
| Notifications                  | Email sending rate and result-notification concurrency, which cannot exceed the configured sending rate.                                                                       |
| Feature switches               | Optional ERP modules, TSA workflow, CCMAS strict mode, NYSC mode, FERPA mode, and explicitly labelled experimental integrations.                                               |

Academic-policy changes automatically increment the institution's grade policy version. New result records retain a snapshot of the relevant grading policy, protecting historical result interpretation when institutional rules change later.

## Policy lifecycle

Every policy version is a separate record. A policy code such as `ACADEMIC-001` can have version `1.0`, then `1.1`, and so on. Published versions are never edited in place.

| Status             | Meaning                                                                        | Who may transition it                                                                                                |
| ------------------ | ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `DRAFT`            | Authoring state; content can be edited.                                        | SUPER_ADMIN or REGISTRAR creates/edits.                                                                              |
| `PENDING_APPROVAL` | Submitted for independent review.                                              | SUPER_ADMIN or REGISTRAR submits.                                                                                    |
| `APPROVED`         | Independently approved and ready for release.                                  | SUPER_ADMIN or VC reviews.                                                                                           |
| `REJECTED`         | Returned with a mandatory rejection reason; editing creates a new draft state. | SUPER_ADMIN or VC reviews.                                                                                           |
| `PUBLISHED`        | Official published version; content is immutable.                              | SUPER_ADMIN or VC publishes.                                                                                         |
| `ARCHIVED`         | Historic, no longer current, but retained for evidence.                        | SUPER_ADMIN or VC archives; publication automatically archives an older published version with the same policy code. |

The author of a submitted policy cannot approve or reject that same policy. This prevents the most basic self-approval loophole. A revised published policy is created as a new draft version; publishing the revision archives the previously published version with that policy code.

## Recommended university policy register

Start with policies that directly affect students, staff, data, or money. Use policy codes that remain stable across revisions.

| Suggested code | Suggested policy                                                     |
| -------------- | -------------------------------------------------------------------- |
| `GOV-001`      | Governance, delegation, and approval authorities                     |
| `ACAD-001`     | Academic regulations, progression, probation, and graduation         |
| `EXAM-001`     | Assessment, examination conduct, result validation, and appeals      |
| `ADM-001`      | Admissions, screening, admissions withdrawal, and deferment          |
| `FIN-001`      | Fees, refunds, waivers, payment channels, and debt control           |
| `STD-001`      | Student code of conduct, discipline, welfare, and grievance          |
| `HR-001`       | Staff conduct, leave, performance, disciplinary, and whistleblowing  |
| `ICT-001`      | ICT acceptable use, account security, and cybersecurity response     |
| `DPA-001`      | NDPR/data protection, privacy notices, retention, and subject rights |
| `HSE-001`      | Health, safety, emergency, and campus security response              |
| `RES-001`      | Research ethics, grants, intellectual property, and publication      |

## Acknowledgement procedure

A policy can be marked **Require acknowledgement** before publication. Users can then record acknowledgement of the exact published version. The record stores the policy version, user, timestamp, client IP, and user agent. Administrators can see acknowledgement totals and a recent acknowledgement list from the policy workspace.

For high-impact policies, set an acknowledgement due date and communicate the policy through institutional channels. The present implementation records acknowledgements; a future phase can add enforcement rules such as blocking selected workflows after a missed acknowledgement deadline. Such blocking must be approved carefully because it can affect student access and staff operations.

## Deployment requirement

The `UniversityPolicy` and `UniversityPolicyAcknowledgement` tables are part of the Prisma schema. Deploy the updated release through the existing controlled schema procedure:

```bash
# Production release job — do not use prisma migrate deploy for this repository.
bash scripts/db/deploy-schema.sh
```

The deployment procedure uses non-destructive Prisma schema synchronization and reapplies the PostgreSQL security baseline. Review the release output, then confirm that the settings and policy pages load for authorised users.

## First-time setup checklist

1. Update seeded institution values with the university’s real identity, official domain, contacts, and brand.
2. Set credit limits, grading scale, assessment weights, course-repeat rules, and result approval path before uploading results.
3. Set financial waiver limits and explicitly decide on TSA routing.
4. Enable only operational modules and integrations that are staffed, trained, and approved.
5. Set mandatory MFA roles before creating high-privilege production accounts.
6. Create initial policy drafts from university-approved source documents.
7. Submit each policy for independent review; do not self-approve.
8. Publish final approved versions, request acknowledgements where appropriate, and monitor completion.
9. Create a new revision rather than editing a published policy.
10. Keep archived versions as governance evidence.
