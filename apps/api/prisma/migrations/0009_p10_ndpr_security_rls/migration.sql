-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration 0009: RLS for NDPR compliance tables (P10)
-- Mirrors the pattern established in 0002_rls_indexes_and_constraints.
--
-- NOTE (documented here for the next person who touches this, matching this
-- project's own convention of being explicit about what is and isn't wired
-- up yet): as of P10, no request path in apps/api actually calls
-- PrismaService.withRls() to SET the app.current_* session variables (see
-- prisma.service.ts — the method exists but has no callers yet). In this
-- environment the application DB user is the table owner, and Postgres
-- exempts table owners from RLS by default, so these policies are currently
-- inert defense-in-depth rather than active filtering. PrivacyService and
-- SecurityIncidentsService therefore do NOT rely on RLS for authorization —
-- they enforce "self, or DPO staffScope, or SUPER_ADMIN" explicitly in
-- application code (via RolesGuard + @StaffScopes('dpo')) and in their own
-- query WHERE clauses. These policies are here so DB-level enforcement is
-- correct and ready the day withRls() is wired into a request-scoped
-- interceptor — do not remove them on the assumption they're doing nothing.
-- ═══════════════════════════════════════════════════════════════════════════════

ALTER TABLE "data_subject_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "security_incidents"    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS dsr_visibility ON "data_subject_requests";
CREATE POLICY dsr_visibility ON "data_subject_requests"
  FOR SELECT
  USING (
    current_setting('app.current_role', TRUE) IN ('SUPER_ADMIN')
    OR "subjectUserId"::text     = current_setting('app.current_user_id', TRUE)
    OR "requestedById"::text     = current_setting('app.current_user_id', TRUE)
    OR current_setting('app.staff_scope', TRUE) LIKE '%dpo%'
  );

DROP POLICY IF EXISTS incident_visibility ON "security_incidents";
CREATE POLICY incident_visibility ON "security_incidents"
  FOR SELECT
  USING (
    current_setting('app.current_role', TRUE) IN ('SUPER_ADMIN', 'VC')
    OR current_setting('app.staff_scope', TRUE) LIKE '%dpo%'
  );

-- DPO/compliance dashboard queries scan by status + due date frequently
-- (SLA tracking) — covered by idx_dsr_sla_tracking / idx_incident_status_date
-- already declared in schema.prisma and created automatically by Prisma's
-- own migration for these two tables.
