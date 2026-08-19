import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PrismaClient } from '@prisma/client';

type AwaitedTuple<T extends readonly unknown[]> = { -readonly [K in keyof T]: Awaited<T[K]> };

/**
 * DirectPrismaService — a second PrismaClient that connects directly to
 * PostgreSQL, bypassing PgBouncer.
 *
 * WHY THIS EXISTS (M5 / Advisory Lock + PgBouncer incompatibility):
 * PgBouncer in transaction-pooling mode assigns a new backend PostgreSQL
 * connection for every transaction. Advisory locks (pg_advisory_xact_lock)
 * are session-scoped in PostgreSQL — they exist only for the duration of
 * the connection. In PgBouncer transaction mode, two calls inside the same
 * Node.js function may land on different backend connections, making the
 * advisory lock completely ineffective as a mutual-exclusion mechanism.
 *
 * P0-2 FIX (this pass — see docs/CHANGELOG.md): this connection now
 * uses DATABASE_DIRECT_URL pointed at a NEW dedicated role, `uniportal_system`
 * (migration 0012), not `uniportal_app`. Reasoning: MatricNumberService — the
 * one real caller — queries `student` (a FORCE ROW LEVEL SECURITY table)
 * to compute the next sequence number for a department/year prefix. That
 * query needs to see every matching student system-wide, regardless of
 * which user triggered admission processing; it is not a "this user's
 * visible rows" operation, it is a system-level sequence generator. Under
 * `uniportal_app` (correctly non-superuser, non-BYPASSRLS, and with no
 * session variables ever set on this separate, non-request-scoped
 * connection) this query would silently return zero rows the moment
 * DATABASE_URL/DATABASE_DIRECT_URL is switched away from the Postgres
 * superuser — and zero existing matches means every new admission in a
 * department/year would be assigned sequence 00001, a guaranteed duplicate
 * matric number. `uniportal_system` has BYPASSRLS specifically because this
 * connection's one documented purpose is exactly this kind of trusted,
 * system-level, cross-user operation — not a stand-in for ordinary
 * per-user queries (see "WHEN NOT TO USE" below, unchanged from the
 * original design).
 *
 * WHEN TO USE:
 *   - MatricNumberService.generate() — prevents duplicate matric numbers
 *   - PrismaService protected-model fallback for background/pre-auth work
 *   - Any future operation requiring advisory locks
 *
 * WHEN NOT TO USE:
 *   - Regular queries (use PrismaService / withRls() / forRequest() instead)
 *   - This bypasses connection pooling AND row-level security — use only for
 *     short-lived, genuinely system-level operations, not as a shortcut
 *     around RLS for anything a specific user's request drives.
 *
 * DATABASE_DIRECT_URL must point to the PostgreSQL primary (not PgBouncer),
 * authenticated as `uniportal_system`.
 *
 * Like PrismaService, this class no longer extends PrismaClient — Prisma
 * removed that pattern's compile-ability in v6.14.0 (see prisma.service.ts
 * for the full explanation). The forwarding surface here is deliberately
 * narrow (just the transaction/raw-query primitives the one real caller
 * needs) rather than the full per-model surface PrismaService exposes, to
 * keep the "this is not for regular queries" signal intact.
 */
@Injectable()
export class DirectPrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DirectPrismaService.name);
  private readonly base: PrismaClient;

  constructor(config: ConfigService) {
    const directUrl = config.get<string>('DATABASE_DIRECT_URL')
      ?? config.get<string>('DATABASE_URL')!;

    this.base = new PrismaClient({
      datasources: { db: { url: directUrl } },
      log: [{ level: 'error', emit: 'event' }],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.base.$connect();
    this.logger.log('DirectPrisma (non-pooled, uniportal_system) connected');
  }

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
  }

  $transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, options?: { maxWait?: number; timeout?: number; isolationLevel?: Prisma.TransactionIsolationLevel }): Promise<T>;
  $transaction<P extends Prisma.PrismaPromise<any>[]>(arr: [...P], options?: { isolationLevel?: Prisma.TransactionIsolationLevel }): Promise<AwaitedTuple<P>>;
  $transaction(...args: unknown[]): unknown {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.base.$transaction as any)(...args);
  }
  // System-only model delegates. These are intentionally exposed only on
  // DirectPrismaService because this connection is the dedicated BYPASSRLS
  // service identity used by background/pre-auth infrastructure.
  get student() { return this.base.student; }
  get studentResult() { return this.base.studentResult; }
  get payment() { return this.base.payment; }
  get payslip() { return this.base.payslip; }
  get courseRegistration() { return this.base.courseRegistration; }
  get lmsSubmission() { return this.base.lmsSubmission; }
  get lmsProgress() { return this.base.lmsProgress; }
  get lmsDiscussionPost() { return this.base.lmsDiscussionPost; }
  get quizQuestion() { return this.base.quizQuestion; }
  get quizAttempt() { return this.base.quizAttempt; }
  get dataSubjectRequest() { return this.base.dataSubjectRequest; }
  get securityIncident() { return this.base.securityIncident; }
  get graduationCandidate() { return this.base.graduationCandidate; }
  get applicant() { return this.base.applicant; }
  get application() { return this.base.application; }
  get user() { return this.base.user; }
  get userRole() { return this.base.userRole; }
  get roleDelegation() { return this.base.roleDelegation; }
  get roleConflictRule() { return this.base.roleConflictRule; }

  get $queryRaw() { return this.base.$queryRaw.bind(this.base); }
  get $queryRawUnsafe() { return this.base.$queryRawUnsafe.bind(this.base); }
  get $executeRaw() { return this.base.$executeRaw.bind(this.base); }
}
