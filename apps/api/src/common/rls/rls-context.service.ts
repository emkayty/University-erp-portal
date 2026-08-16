import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/**
 * RlsContextService — audit remediation R2 ("request-scoped RLS").
 *
 * BACKGROUND: RLS session variables are established once per authenticated
 * request by RlsInterceptor. Protected Prisma model forwarding then uses the
 * ambient transaction automatically, so individual services do not need to
 * remember a separate RLS call site.
 *
 * THE ROOT-CAUSE FIX (same pattern as the FeatureFlagGuard fix — AUDIT-H1):
 * instead of teaching 32 services to remember to call withRls(), a single
 * global interceptor (RlsInterceptor) opens the transaction once per
 * authenticated request and stores the transaction client here, in
 * AsyncLocalStorage, keyed to that request's async context. Services obtain
 * the ambient client via `prisma.forRequest()` (see PrismaService) instead
 * of touching `this.prisma.<model>` directly.
 *
 * RLS routing is now centralized in PrismaService's protected-model
 * forwarding getters: request handlers receive the ambient transaction,
 * while trusted background/pre-auth infrastructure falls back to the
 * dedicated system connection rather than the restricted runtime role.
 */
export interface RlsIdentity {
  userId: string;
  role: string;
  deptId: string;
}

/**
 * The protected tables under FORCE ROW LEVEL SECURITY (migration 0011). Exported so
 * PrismaService's Client Extension can fail closed whenever one of these models
 * is queried through the plain, non-RLS-scoped client while an ambient RLS
 * transaction is available for the current request — i.e. a service that forgot
 * to call forRequest(). Background jobs and seed scripts have no ambient request
 * context and therefore do not enter this guard; trusted system operations use
 * DirectPrismaService explicitly. See docs/CHANGELOG.md item P0-2.
 */
export const FORCE_RLS_MODELS = new Set([
  'Student', 'StudentResult', 'Payment', 'Payslip',
  'CourseRegistration', 'DataSubjectRequest', 'SecurityIncident', 'GraduationCandidate',
]);

@Injectable()
export class RlsContextService {
  private readonly als = new AsyncLocalStorage<Prisma.TransactionClient>();

  /** Called once by RlsInterceptor per request; everything inside `fn` shares one ambient tx client. */
  run<T>(tx: Prisma.TransactionClient, fn: () => Promise<T>): Promise<T> {
    return this.als.run(tx, fn);
  }

  /** Returns the ambient transaction client for the current request, or undefined outside a request (e.g. cron jobs, seed scripts). */
  getClient(): Prisma.TransactionClient | undefined {
    return this.als.getStore();
  }
}
