# UniPortal ERP Architecture

## Academic integrity boundary

The academic domain engine is pure and deterministic. Application services are responsible for authorization, loading authoritative records, validating registration and policy scope, executing changes transactionally, and persisting the resulting decision snapshot.

## Security boundary

PostgreSQL RLS is enforced for protected operational tables. The application runtime uses the restricted `uniportal_app` role and request-scoped session variables. Application RBAC and database RLS are deliberately complementary: API guards provide user-facing authorization while RLS prevents accidental cross-tenant/object access at the database boundary.

## Result lifecycle

`DRAFT → HOD_APPROVED → [DEAN_APPROVED] → SENATE_PENDING → SENATE_PUBLISHED` with explicit rejection and withholding paths. Published amendments and withholding/release operations recompute CGPA in the same transaction.

## Academic history

`StudentAcademicHistory` is a semester-level snapshot. Legacy rows without a semester identifier remain historical records; all new writes use `(studentId, semesterId)` as the business identity.
