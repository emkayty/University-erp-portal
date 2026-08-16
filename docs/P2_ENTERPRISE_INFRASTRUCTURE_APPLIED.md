# P2 Enterprise Infrastructure — Applied

This pass establishes the ERP infrastructure primitives required for reliable enterprise operation.

## Applied

- Versioned workflow definitions, steps, instances and tasks.
- Notification preferences and durable notification records.
- Notification ownership protection with RLS.
- Enterprise document metadata with classification, checksum and verification lifecycle.
- Integration endpoint and idempotent delivery records with retry state.
- Authorized search-index metadata with scope keys.
- Workflow instance creation is transactional and idempotent for an active entity workflow.
- Notification creation respects per-channel user preferences.
- Notification read operation is owner-scoped.
- Added an in-app notification center.
- Added infrastructure module/service without adding external dependencies.
- Added migration `0022_p2_enterprise_infrastructure`.
- Preserved API authorization as the final security boundary.

## Important production safeguards

This pass intentionally does not invent external provider credentials, cloud storage configuration, SMTP/SMS/WhatsApp providers, observability vendors, backup credentials, or production URLs.

Those values belong in environment/secret management and deployment configuration.

Search indexing also remains authorization-aware: the index is not a substitute for the application's access-control layer.

## Verification limitation

The uploaded archive does not contain installed dependencies or a connected production/test PostgreSQL instance, so Prisma generation/migration, TypeScript compilation and browser E2E execution cannot honestly be reported as passed here.
