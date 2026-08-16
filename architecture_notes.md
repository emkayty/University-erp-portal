# Architecture Notes

The repaired project is a pnpm/Turbo monorepo with a NestJS API under `apps/api`, a Next.js web application under `apps/web`, shared config/types/utils packages, a generated Prisma client package, and Terraform/Docker/CodeDeploy/GCP deployment surfaces.

The API root module globally registers JWT authentication, throttling, feature flags, an RLS interceptor, Redis, cache-manager, BullMQ queues, scheduled jobs, and all phase modules. The module comments state that RLS context currently feeds PrivacyService only, which is a potential scope gap requiring verification. The root module registers a large set of domain modules, including notifications, admissions, students, fees, exams, results, HR, payroll, library, reports, privacy, security, policies, and clearance.

The repaired archive contains the lockfile, ESLint flat config, notifications controller, authenticated payroll download client usage, migration-secret propagation, and V36 contract test. Further audit work must distinguish static/source correctness from live runtime and business-workflow behavior.

## Authentication observations

JWT authentication is globally enforced through Passport and accepts only RS256 bearer tokens with issuer and audience checks. The strategy checks active/deleted status and MFA state through a Redis cache, and adds a derived student ID for student-role callers. The code assumes Redis is available for authentication; failure behavior and cache poisoning/serialization handling require further validation. The guard's error classification maps most failures to an expired-token code, which may reduce diagnostic accuracy. The global RLS interceptor is commented as currently consumed by PrivacyService only; this is a likely authorization/data-isolation gap unless other services independently scope every query.

## Privacy and DSR observations

Privacy routes use a controller-level RolesGuard and inline self/DPO checks. Erasure and restriction rely on route decorators plus RolesGuard. The service comments claim every request row is created first, but rectification, erasure, and restriction perform the mutation before creating `DataSubjectRequest`; partial failure can therefore create an untracked or partially tracked DSR action. Erasure performs multiple updates and audit-log rewrites without an explicit transaction, so a failure after deleting/pseudonymising the user can leave incomplete erasure state. The audit return includes `wasEmail`, which may expose the erased subject email to the caller and could undermine the intended privacy boundary. These need schema and call-chain verification.

## Database and payment observations

`PrismaService` routes some protected delegates to the ambient request transaction but silently falls back to a privileged system/BYPASSRLS client when no ambient context exists. The plain client query extension only logs an RLS-bypass warning instead of throwing. Batch `$transaction([...])` remains on the plain client, and raw unsafe execution is exposed on the plain client. This creates a strong architectural dependence on every service choosing the correct access primitive; a missed call can return data outside user scope.

Payment initiation and confirmation have substantial idempotency and amount checks. Paystack confirmation is provider-verified, while Remita webhooks are treated as pings and queue a reconciliation job. However, Remita reconciliation is intentionally disabled until a merchant-specific status adapter is configured, so Remita payments can remain pending in production unless operational configuration is complete. Manual TSA payment looks up the fee through the plain service delegate before entering its protected transaction, which may bypass request RLS even though the route is bursar-only. Provider endpoint and payload correctness remain deployment-dependent rather than proven by tests.

## Reporting and role-administration observations

The report worker reads a broad cross-module dataset from a read replica and marks exports completed after artifact generation. NDPR SAR/portability custom exports intentionally omit medical records, library loans, hostel allocations, and other PII-bearing surfaces; one payment query catches all errors and substitutes an empty list, so a data-access failure can produce a successful but incomplete export. This is a confirmed privacy/completeness defect, not merely a missing feature.

The SUPER_ADMIN cap is checked under an advisory lock, but `createUser()` and `grantRole()` perform the actual user/role write after the lock transaction has ended. Concurrent requests can therefore exceed the configured cap. `findAll()` uses a batch transaction through the plain client; if User becomes RLS-protected or the caller’s scope matters, this path is not guaranteed to use the ambient identity. Role updates also need verification for self-grant/self-revoke separation-of-duties controls at the controller and service layers.

## Session, feature-flag, and RLS observations

Refresh-token rotation performs Redis `GET`, then `DEL`, then issues a new token as separate operations. Two concurrent refresh requests can potentially read the same refresh token before either deletes it, creating more than one successor token; a single-use rotation primitive should be atomic if replay resistance is required. Refresh and password/session flows also use plain Prisma delegates outside the request-RLS path.

Feature flags are globally enforced through a guard that resolves SettingsService per request and caches flags, but the guard returns a generic forbidden error and its behavior depends on runtime cache/database availability. The global RLS interceptor holds a database transaction/connection for the entire handler, including external I/O and queue calls, creating pool exhaustion and transaction-duration risk under slow provider calls. The implementation assumes a single REST emission and silently bypasses itself for public or explicitly skipped routes; this is safe only if every skipped route is independently scoped and protected.

## Frontend/backend contract observations

The shared frontend client expects every JSON response to be an envelope with `success` and `data`. The global logging interceptor does not wrap responses. Several backend controllers—research, alumni, transport, search, security, privacy, and audit-viewer—return service results directly rather than `{ success: true, data: ... }`, while their frontend hooks call the shared client. Those screens/mutations are therefore likely to fail at runtime despite passing type-check and route-path checks; this is a confirmed cross-layer response-contract defect.

A separate confirmed identity bug exists in `FeesController.getFeeById()`: it compares `fee.studentId` (a Student.id) directly to `u.sub` (a User.id), unlike adjacent endpoints that use `resolveSelfOrTargetStudentId`. A student can be denied access to their own invoice when the two IDs differ. The frontend fees page correctly supplies the authenticated user ID to self-scoped endpoints, so the controller must normalize it consistently.

The report-generation endpoint permits HOD to enqueue any `ReportType`, while the DTO accepts arbitrary filters and the worker reads broad financial/payroll/student datasets without applying the requester’s role or department scope. This creates a likely sensitive-report overexposure path: HOD can request report types whose live endpoints exclude HOD. It needs a service-level role/type/scope policy, not only controller role membership.

## Operational and compliance observations

Admissions JAMB and WAEC workers are explicitly stubs that only log “integration pending” and leave verification to manual review; the queue can complete without changing applicant verification state. This is a material workflow insufficiency if the product promises automated admissions verification.

Security-incident reporting records incidents and schedules reminders, but NITDA filing is deliberately out-of-band. If no VC/DPO recipient exists, the incident is still recorded and the operation returns success while no in-system alert is delivered. Resolution can be marked independently of `NITDA_NOTIFIED`, so a resolved incident may stop appearing overdue without proving regulatory notification. This is a compliance-state-machine gap.

The frontend uses the shared client for most calls, but backend response envelopes are inconsistent across several modules, making runtime connectivity materially worse than route matching suggests. Student fee invoice access is also inconsistent with the repaired User.id/Student.id normalization pattern.

## Deployment and runtime observations

The production Compose file has a likely blocking Redis healthcheck defect: Redis is started with `--requirepass ${REDIS_PASSWORD}`, but the Redis service does not expose `REDIS_PASSWORD` in its container environment; the healthcheck runs `redis-cli -a "$REDIS_PASSWORD"` inside the container and therefore likely supplies an empty password. Because API/worker depend on `redis: service_healthy`, they may never start.

Compose passes `MIGRATE_DATABASE_URL` correctly, but the shared API environment omits Remita status-verification variables (`REMITA_STATUS_ENDPOINT`, `REMITA_STATUS_VERIFICATION_ENABLED`) and other provider settings used by the source, so Remita reconciliation remains disabled unless separately injected. The web image defaults `NEXT_PUBLIC_API_URL` to `http://localhost:3001`, which is unsafe for any deployment accessed from another host unless explicitly overridden. The API and worker share the same broad environment, while operational role separation is implemented only through startup commands.

## Financial and asynchronous consistency observations

Fee-waiver approval is not concurrency-safe: it reads a PENDING waiver outside the transaction, then locks only the fee row and updates the waiver without a conditional status transition. Two approvals can both add the waiver amount; approval and rejection can race so a row ends as REJECTED while the fee amount has already been increased. HOD waiver requests also do not visibly enforce department ownership of the target student fee.

Invoice generation claims deterministic idempotency but assigns invoice numbers from `sequenceOffset + idx + 1` and advances the offset by `createMany().count`. When existing rows are skipped, the same student can receive a different sequence on a retry and collide with another invoice number; the StudentFee schema has a global unique invoiceNo, so a retry can fail or mis-handle idempotency. Invoice numbers should derive from stable student/schedule identity or be allocated transactionally.

Several state changes enqueue BullMQ jobs directly after database writes without an outbox or durable enqueue record: report generation, invoice generation, admissions verification, privacy exports, security reminders, and payment reconciliation. Queue failure can leave a report/export/incident in a permanent pending or under-notified state. Payment completion itself correctly uses an outbox, but the broader architecture is not uniformly reliable.

Login accepts the arbitrary `from` query parameter and passes it to `router.replace()` after authentication without restricting it to an internal path, creating a potential post-login open redirect. Middleware also returns early for public auth paths before applying its intended redirect for already-authenticated users; this is a UX/state inconsistency. The `session_active` cookie is intentionally client-set and is only a routing hint, not a security boundary.

## Privacy and identity-governance observations

Privacy erasure is not wrapped in one transaction: it deletes or pseudonymises the user, scrubs historical audit rows in a loop, then creates the DSR record and audit event. A failure between these steps can leave a partially completed erasure with no durable completed request. The VC sign-off is only a free-form attestation string, explicitly not a verified approval record, so the two-person control is procedural/out-of-band rather than enforced by the system.

The privacy service does enforce self/DPO/super-admin checks at the controller, and the erasure/restriction routes now have RolesGuard. Nevertheless, the privacy export is built from a partial table set and can report completion while omitting PII-bearing modules. This must be treated as a data-governance correctness issue even if the access boundary is otherwise sound.

## Reporting and export security observations

`ReportArtifactService` escapes CSV syntax but does not neutralize spreadsheet formula prefixes (`=`, `+`, `-`, `@`). User-controlled names, descriptions, or other exported strings can therefore become formula cells when opened in spreadsheet software. XLSX writes all cells as inline strings, which reduces that risk for XLSX, but CSV remains unsafe for untrusted data.

The reporting connection is optional and `PrismaService.readReplica` falls back to `DATABASE_URL` when `REPORTING_DATABASE_URL` is absent. This does not violate confidentiality by itself, but it removes workload isolation and can make institution-wide report queries compete with transactional traffic. Production configuration does not fail fast on a missing reporting database or report bucket; the failure is deferred until a report is requested/generated.

Global throttling is configured without an explicit shared Redis storage adapter. In a multi-instance deployment, rate limits are likely process-local unless the framework configuration supplies shared storage elsewhere; this should be treated as an unverified horizontal-scaling control gap.
