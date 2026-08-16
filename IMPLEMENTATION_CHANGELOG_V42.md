# UniPortal ERP V42 — Private LMS Attachment Storage

**Release:** V42 Enhanced  
**Date:** 15 August 2026  
**Author:** Manus AI  
**Repository:** UniPortal ERP monorepo (`pnpm` workspaces and Turbo)

## Release summary

V42 completes the LMS submission-attachment security lifecycle. Attachments are now uploaded to private S3-compatible object storage through short-lived AWS SigV4 presigned URLs, while download access is issued only after API authorization. The implementation preserves the existing LMS enrolment boundaries, response envelope, RLS-aware persistence model, and frontend/backend contracts.

> **Security outcome:** The browser never receives a public object URL. Students can upload only against an API-issued, student-scoped key, and attachment downloads are authorized by the LMS service for the submission owner or permitted staff before a short-lived GET URL is returned.

## Backend implementation

### Private object-storage service

`apps/api/src/common/storage/private-object-storage.service.ts` introduces a reusable private-storage service with the following capabilities:

| Capability | V42 behavior |
|---|---|
| Presigned upload | Generates an AWS SigV4 PUT URL with the requested content type and bounded expiry. |
| Presigned download | Generates an AWS SigV4 GET URL only after the caller passes LMS authorization checks. |
| Credential resolution | Supports environment credentials and workload-identity resolution through ECS container credentials and EC2 IMDSv2 fallback. |
| Bucket selection | Uses `S3_UPLOADS_BUCKET` for LMS submission attachments and does not expose credentials or bucket secrets in API responses. |
| Key validation | Rejects absolute paths, traversal segments, public URLs, empty keys, control characters, and malformed object keys. |
| Size protection | Enforces the LMS attachment size limit before presigning. |
| Failure behavior | Returns a service-unavailable response when private storage is not configured rather than silently falling back to public storage. |

The service is registered by `apps/api/src/modules/lms/lms.module.ts`, keeping the storage dependency local to the LMS feature while leaving the implementation reusable for future private-object workflows.

### LMS presign and download lifecycle

`apps/api/src/modules/lms/lms.service.ts` now provides two guarded operations:

1. `presignSubmissionAttachment()` confirms that the content exists, is an assignment, and belongs to an offering for which the requesting student has an active registration. It creates a random object key under `lms/submissions/{studentId}/{contentId}/` and returns a presigned PUT contract.
2. `getSubmissionAttachment()` loads the submission through the RLS-aware Prisma service, validates the stored key and metadata, and permits access only to the submission owner or authorized staff. It then returns a short-lived presigned GET contract.

The controller exposes the lifecycle through:

| Method | Route | Purpose |
|---|---|---|
| `POST` | `/lms/submissions/attachments/presign` | Authorize an enrolled student and issue a private upload URL. |
| `GET` | `/lms/submissions/:id/attachment` | Authorize the submission owner or staff and issue a private download URL. |

The existing submission endpoint continues to persist opaque attachment metadata only. Public URLs and traversal-style keys remain rejected.

### Readiness visibility

`GET /health/integrations` now includes an `lmsStorage` readiness object:

```json
{
  "configured": true,
  "mode": "private-s3"
}
```

When `S3_UPLOADS_BUCKET` is absent, the response reports `configured: false` and `mode: "not-configured"`, without disclosing credentials or provider details.

## Frontend implementation

`apps/web/app/dashboard/lms/page.tsx` now supports the complete student workflow:

- A constrained file picker accepts PDF, text, JPEG, PNG, and ZIP attachments.
- The client requests a short-lived presigned PUT URL from the LMS API.
- The selected file is uploaded directly to private object storage with the returned headers.
- The final LMS submission persists only the opaque key and attachment metadata.
- Existing manually supplied opaque keys remain supported for compatible workflows.
- Submission rows display an authorized download button only when attachment metadata exists.
- Download requests go through the LMS API, which returns a short-lived GET URL after authorization.
- The client enforces a 10 MiB file limit before attempting upload and reports upload or authorization failures without exposing storage credentials.

## Assurance coverage

V42 adds or updates the following test coverage:

| Test area | Coverage | Result |
|---|---|---|
| Private object storage | Key validation, presigned PUT shape, presigned GET shape, missing-bucket failure | **3 tests passed** |
| LMS service | Enrolment-gated presign, owner/staff download authorization, attachment-key rejection, and existing LMS lifecycle behavior | **13 tests passed** |
| Full API suite | All API service, route-contract, security, and module tests | **28 suites / 393 tests passed** |
| Utility packages | All utility package suites | **5 suites / 36 tests passed** |
| Static security audit | P5 static security-pattern audit | **Passed** |
| Integration contracts | P5 integration-contract audit | **Passed** |
| Route contracts | Existing route-contract assurance | **13 tests passed** |

## Verification results

The required verification stages completed successfully on 15 August 2026:

| Stage | Result |
|---|---|
| Workspace installation | Passed; lockfile remained current. |
| Prisma client generation | Passed; Prisma Client 6.19.3 generated successfully. |
| Prisma schema validation | Passed. |
| Monorepo type-check | Passed; all 9 Turbo tasks successful. |
| Serial test run | Passed; all 6 Turbo tasks successful. |
| Lint | Passed; all 5 Turbo tasks successful with zero configured warnings. |
| Production build | Passed; all 5 Turbo tasks successful. |
| P1 academic-integrity validation | Passed; 11 invariants. |
| P2 operational-contract validation | Passed; 9 invariants. |
| P4 dynamic-code rule audit | Passed. |
| P5 static security-pattern audit | Passed. |
| P5 contract validation | Passed. |
| P5 integration-contract audit | Passed. |
| Route-contract audit | Passed; 13 tests. |

The deep-verification artifacts are retained in `verification/`, with the V42 release-specific copies under `verification/v42/`.

## Files changed or added

- `apps/api/src/common/storage/private-object-storage.service.ts`
- `apps/api/src/common/storage/private-object-storage.service.spec.ts`
- `apps/api/src/modules/lms/lms.module.ts`
- `apps/api/src/modules/lms/lms.service.ts`
- `apps/api/src/modules/lms/lms.service.spec.ts`
- `apps/api/src/modules/lms/lms.controller.ts`
- `apps/api/src/modules/lms/dto/lms.dto.ts`
- `apps/api/src/health/health.controller.ts`
- `apps/web/app/dashboard/lms/page.tsx`
- `IMPLEMENTATION_CHANGELOG_V42.md`

## Operational configuration

Deployments that enable LMS attachment upload must provide `S3_UPLOADS_BUCKET` and the corresponding AWS-compatible workload identity or environment credentials. The bucket should remain private and be configured with the required CORS rule for browser PUT requests from the UniPortal frontend. The application should be deployed only after confirming that `GET /health/integrations` reports `lmsStorage.mode` as `private-s3`.

V42 does not introduce a public-storage fallback. If private storage is not configured, presigning fails explicitly and the readiness endpoint reports the missing configuration.
