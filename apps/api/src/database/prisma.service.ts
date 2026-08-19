import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, PrismaClient } from "@prisma/client";

type AwaitedTuple<T extends readonly unknown[]> = {
  -readonly [K in keyof T]: Awaited<T[K]>;
};
import {
  RlsContextService,
  FORCE_RLS_MODELS,
} from "../common/rls/rls-context.service";
import { DirectPrismaService } from "./direct-prisma.service";
import {
  SOFT_DELETE_MODELS,
  softDeleteRedirectOperation,
  applySoftDeleteReadFilter,
} from "./soft-delete.util";

/**
 * PrismaService — production-hardened database client.
 *
 * P0-1 FIX (this pass — see docs/CHANGELOG.md):
 * Prisma removed `$use()` entirely in v6.14.0, and a class can no longer
 * `extend PrismaClient` at all from that version onward (confirmed directly:
 * this project's lockfile resolves @prisma/client to 6.19.3, and installing
 * that exact package shows zero references to $use anywhere in it). Both the
 * soft-delete middleware and the class inheritance pattern this file used to
 * use are gone. This is not a style preference — the previous version of
 * this file does not compile against the dependency version already locked
 * in pnpm-lock.yaml.
 *
 * THE FIX: PrismaService no longer extends PrismaClient. It holds a private
 * base PrismaClient and an extension-wrapped client for soft-delete and
 * diagnostics. Protected model getters route to the ambient RLS transaction
 * during authenticated HTTP requests, and to the dedicated system connection
 * for trusted background/pre-auth infrastructure. Existing service call sites
 * therefore cannot accidentally use the restricted runtime role without an
 * identity.
 *
 * Prior fixes preserved from earlier passes:
 *  C2  — withRls() uses Prisma $executeRaw tagged template literals.
 *         $executeRawUnsafe with string interpolation was replaced completely.
 *         Prisma passes tagged-template values as PostgreSQL bind parameters,
 *         making SQL injection structurally impossible.
 *  B5  — Soft-delete extension covers all 8 read operations (including
 *         findUniqueOrThrow, findFirstOrThrow, aggregate, groupBy).
 *  B6  — setRlsContext() removed. withRls() is the only public RLS interface.
 *
 * VERIFICATION NOTE: this file could not be checked against a live
 * `prisma generate` + `tsc` build in this sandbox — the same
 * binaries.prisma.sh network restriction the prior three audit passes hit.
 * The soft-delete decision logic (which model/operation combinations
 * redirect or get filtered) is factored into soft-delete.util.ts specifically
 * so it could be unit-tested directly (see soft-delete.util.spec.ts, which
 * runs and passes under the real Jest toolchain in this environment). The
 * Client Extension wiring below follows Prisma's documented query/model
 * extension components as of the locked 6.19.3 release. Run
 * `pnpm --filter api exec prisma generate && pnpm --filter api run type-check
 * && pnpm --filter api test` in an environment with full network access as
 * the first verification step before merging — do not take this file's
 * correctness on the comment's word alone.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly base: PrismaClient;

  /** The extended client — soft delete + slow-query logging + the RLS bypass
   *  warning applied. Forwarding getters below point here; new code can also
   *  reference `this.prisma.client.<model>` directly if preferred. */
  readonly client: PrismaClient;

  constructor(
    private readonly config: ConfigService,
    private readonly rlsContext: RlsContextService,
    private readonly system: DirectPrismaService,
  ) {
    this.base = new PrismaClient({
      datasources: { db: { url: config.get<string>("DATABASE_URL") } },
      log: [
        { level: "query", emit: "event" },
        { level: "error", emit: "event" },
        { level: "warn", emit: "event" },
      ],
    });
    this.registerSlowQueryLogger();
    this.client = this.buildExtendedClient();
  }

  async onModuleInit(): Promise<void> {
    await this.base.$connect();
    this.logger.log("Prisma connected to PostgreSQL");
  }

  async onModuleDestroy(): Promise<void> {
    await this.base.$disconnect();
    this.logger.log("Prisma disconnected");
  }

  /**
   * FIX C2: Uses Prisma $executeRaw tagged template literals.
   *
   * BEFORE (vulnerable): $executeRawUnsafe(`SET LOCAL app.current_user_id = '${userId}'`)
   * AFTER  (safe):        $executeRaw`SET LOCAL app.current_user_id = ${userId}`
   *
   * Prisma's tagged template passes the value as a PostgreSQL bind parameter ($1),
   * making SQL injection structurally impossible regardless of input content.
   *
   * IMPORTANT: withRls() wraps operations in $transaction so that SET LOCAL
   * is scoped to the transaction duration. PgBouncer transaction-pooling mode
   * pins the backend connection for the transaction lifetime — SET LOCAL is safe.
   *
   * Advisory locks MUST use DATABASE_DIRECT_URL connection (non-pooled).
   * See: DirectPrismaService (added in P3) for advisory-lock-safe queries.
   */
  async withRls<T>(
    userId: string,
    role: string,
    deptId: string,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: Parameters<PrismaClient["$transaction"]>[1],
  ): Promise<T> {
    return this.client.$transaction(async (tx: Prisma.TransactionClient) => {
      // PostgreSQL does not accept bind parameters in `SET LOCAL name = value`.
      // set_config accepts a bound value and the final `true` scopes it to this
      // transaction, preventing RLS identity leakage between pooled requests.
      await tx.$executeRaw`SELECT set_config('app.current_user_id', ${userId}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_role', ${role}, true)`;
      await tx.$executeRaw`SELECT set_config('app.current_dept_id', ${deptId}, true)`;
      return fn(tx);
    }, options);
  }

  /**
   * Returns the ambient request transaction when one exists. Services that
   * need the transaction explicitly can use this method; protected model
   * getters already apply the same routing automatically.
   */
  forRequest(rlsContext: {
    getClient(): Prisma.TransactionClient | undefined;
  }): Prisma.TransactionClient | PrismaService {
    return rlsContext.getClient() ?? this;
  }

  /**
   * runExclusive() — the transaction primitive migrated services use
   * instead of calling $transaction() directly (this pass, combining
   * P0-2's RLS rollout with the P1-1/P1-2 advisory-lock fixes — see
   * docs/CHANGELOG.md). If the current request has an ambient RLS
   * transaction (RlsInterceptor opened one for this request — see
   * rls-context.service.ts), `fn` runs INSIDE that same transaction, so
   * the work is correctly scoped to the request's RLS session variables
   * and the request doesn't hold a second database connection alongside
   * the one RlsInterceptor already opened. If there is no ambient
   * transaction (cron jobs, `prisma db seed`, unit tests calling the
   * service directly), the dedicated system connection is used so protected
   * tables remain accessible to trusted infrastructure without pretending an
   * end-user RLS identity exists.
   *
   * IMPORTANT: Prisma.TransactionClient does not support nested/batched
   * $transaction() calls (see rls-context.service.ts's docblock). Callers
   * migrating from `this.prisma.$transaction([queryA, queryB])` — the
   * array/batch form — must switch to sequential awaits against `tx`
   * instead; this method only supports the callback form.
   */
  async runExclusive<T>(
    rlsContext: RlsContextService,
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    const ambient = rlsContext.getClient();
    if (ambient) return fn(ambient);
    // Outside an authenticated HTTP request (workers, webhooks, CLI jobs),
    // protected tables must not run through the restricted app role with no
    // RLS identity. Use the dedicated system transaction instead.
    return this.system.$transaction(fn);
  }

  /**
   * Runs a trusted system/background operation on the dedicated system
   * connection. Use only for jobs and pre-auth infrastructure that cannot have
   * an end-user request identity. Normal HTTP handlers must use the ambient
   * request context instead.
   */
  async runSystem<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return this.system.$transaction(async (tx) => fn(tx));
  }

  async isHealthy(): Promise<boolean> {
    try {
      await this.client.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  // ── Read replica for reporting/analytics ───────────────────────────────────
  private _replica: PrismaClient | null = null;
  get readReplica(): PrismaClient {
    if (!this._replica) {
      const url =
        this.config.get<string>("REPORTING_DATABASE_URL") ?? this.config.get<string>("PRISMA_REPORTING_URL") ??
        this.config.get<string>("DATABASE_URL")!;
      const replicaBase = new PrismaClient({ datasources: { db: { url } } });
      this._replica = this.buildExtendedClient(replicaBase);
    }
    return this._replica;
  }

  // ── Slow query logger ───────────────────────────────────────────────────────
  private registerSlowQueryLogger(): void {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.base.$on as any)("query", (e: Prisma.QueryEvent) => {
      if (e.duration > 500)
        this.logger.warn(
          `Slow query (${e.duration}ms): ${e.query.slice(0, 200)}`,
        );
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this.base.$on as any)("error", (e: { message: string }) =>
      this.logger.error(`Prisma error: ${e.message}`),
    );
  }

  // ── Client Extension: soft delete + RLS-bypass warning (replaces $use) ─────
  private buildExtendedClient(source: PrismaClient = this.base): PrismaClient {
    const modelOverrides: Record<string, unknown> = {};
    for (const model of SOFT_DELETE_MODELS) {
      const prop = model.charAt(0).toLowerCase() + model.slice(1);
      modelOverrides[prop] = {
        // Redirect delete -> update(deletedAt: now). Prisma.getExtensionContext(this)
        // is the documented way to call a sibling operation from inside a
        // model-level override without hitting "this.update is not a
        // function" (see docs/CHANGELOG.md P0-1 for sources).
        async delete(this: unknown, args: { where: unknown }) {
          const ctx = Prisma.getExtensionContext(this) as {
            update: (a: unknown) => unknown;
          };
          return ctx.update({
            where: args.where,
            data: { deletedAt: new Date() },
          });
        },
        async deleteMany(this: unknown, args: { where?: unknown }) {
          const ctx = Prisma.getExtensionContext(this) as {
            updateMany: (a: unknown) => unknown;
          };
          return ctx.updateMany({
            where: args?.where ?? {},
            data: { deletedAt: new Date() },
          });
        },
      };
    }

    const rlsContext = this.rlsContext;
    const logger = this.logger;

    return source.$extends({
      name: "soft-delete-and-rls-guard",
      model: modelOverrides as never,
      query: {
        $allModels: {
          $allOperations({
            model,
            operation,
            args,
            query,
          }: {
            model?: string;
            operation: string;
            args: unknown;
            query: (args: unknown) => Promise<unknown>;
          }) {
            // Defensive fallback: softDeleteRedirectOperation only ever
            // returns non-null for `delete`/`deleteMany`, which are already
            // intercepted by the `model` overrides above and never reach
            // this query-level hook for soft-delete models. Kept here so a
            // future refactor that removes the model override doesn't
            // silently regress to hard deletes.
            const redirected = softDeleteRedirectOperation(model, operation);
            if (redirected) {
              logger.warn(
                `Unexpected: ${operation} on ${model} reached the query hook — ` +
                  `the model-level override should have intercepted this first.`,
              );
            }

            if (
              model &&
              FORCE_RLS_MODELS.has(model) &&
              rlsContext.getClient() !== undefined
            ) {
              // We ARE inside a request with an ambient RLS transaction
              // available, but this query is running on the plain client —
              // almost certainly a missed forRequest() call. A warning is not
              // an authorization boundary: fail closed before the query can
              // execute outside the request identity.
              throw new Error(
                `RLS_CONTEXT_REQUIRED: ${model}.${operation} attempted on the plain client ` +
                `while an authenticated RLS transaction is active. Route this operation ` +
                `through prisma.forRequest(rlsContext).`,
              );
            }

            const filteredArgs = applySoftDeleteReadFilter(
              model,
              operation,
              args as Record<string, unknown> | undefined,
            );
            return query(filteredArgs as never);
          },
        },
      },
    }) as unknown as PrismaClient;
  }

  // ── Explicit per-model forwarding (generated from schema.prisma's current
  //    models — see docs/CHANGELOG.md item P0-1 for why this is
  //    explicit rather than a catch-all Proxy) ────────────────────────────
  get academicCalendar() {
    return this.client.academicCalendar;
  }
  get academicSubject() {
    return this.client.academicSubject;
  }
  get academicRequirementGroup() {
    return this.client.academicRequirementGroup;
  }
  get academicRequirement() {
    return this.client.academicRequirement;
  }
  get academicPlan() {
    return this.client.academicPlan;
  }
  get academicPolicyVersion() {
    return this.client.academicPolicyVersion;
  }
  get academicPlanItem() {
    return this.client.academicPlanItem;
  }
  get academicPlacement() {
    return this.client.academicPlacement;
  }
  get academicStanding() {
    return this.client.academicStanding;
  }
  get progressionEvaluation() {
    return this.client.progressionEvaluation;
  }
  get degreeAudit() {
    return this.client.degreeAudit;
  }
  get courseEquivalency() {
    return this.client.courseEquivalency;
  }
  get academicExemption() {
    return this.client.academicExemption;
  }
  get academicSubstitution() {
    return this.client.academicSubstitution;
  }
  get academicAppeal() {
    return this.client.academicAppeal;
  }
  get programmeTransferRequest() {
    return this.client.programmeTransferRequest;
  }
  get academicInterruption() {
    return this.client.academicInterruption;
  }
  get academicCredential() {
    return this.client.academicCredential;
  }
  get administrativeDivision() {
    return this.client.administrativeDivision;
  }
  get admissionCycle() {
    return this.client.admissionCycle;
  }
  get admissionRequirement() {
    return this.client.admissionRequirement;
  }
  get admissionScreening() {
    return this.client.admissionScreening;
  }
  get application() {
    return this.client.application;
  }
  get applicationAccessibilityRequest() {
    return this.client.applicationAccessibilityRequest;
  }
  get applicationDraft() {
    return this.client.applicationDraft;
  }
  get applicationConsent() {
    return this.client.applicationConsent;
  }
  get applicationChangeRequest() {
    return this.client.applicationChangeRequest;
  }
  get applicationDocument() {
    return this.client.applicationDocument;
  }
  get alumni() {
    return this.client.alumni;
  }
  get applicant() {
    return this.client.applicant;
  }
  get appointment() {
    return this.client.appointment;
  }
  get attendanceRecord() {
    return this.client.attendanceRecord;
  }
  get assessmentComponent() {
    return this.client.assessmentComponent;
  }
  get assessmentMark() {
    return this.client.assessmentMark;
  }
  get assessmentScheme() {
    return this.client.assessmentScheme;
  }
  get auditLog() {
    return this.client.auditLog;
  }
  get automationTask() {
    return this.client.automationTask;
  }
  get businessRule() {
    return this.client.businessRule;
  }
  get calendarEvent() {
    return this.client.calendarEvent;
  }
  get country() {
    return this.client.country;
  }
  get campaign() {
    return this.client.campaign;
  }
  get clearanceItem() {
    return this.client.clearanceItem;
  }
  get course() {
    return this.client.course;
  }
  get courseAnnouncement() {
    return this.client.courseAnnouncement;
  }
  get courseContent() {
    return this.client.courseContent;
  }
  get lmsSubmission() {
    return (this.rlsContext.getClient() ?? this.system).lmsSubmission;
  }
  get lmsProgress() {
    return (this.rlsContext.getClient() ?? this.system).lmsProgress;
  }
  get lmsDiscussionPost() {
    return (this.rlsContext.getClient() ?? this.system).lmsDiscussionPost;
  }
  get quizQuestion() {
    return (this.rlsContext.getClient() ?? this.system).quizQuestion;
  }
  get quizAttempt() {
    return (this.rlsContext.getClient() ?? this.system).quizAttempt;
  }
  get courseOffering() {
    return this.client.courseOffering;
  }
  get curriculumVersion() {
    return this.client.curriculumVersion;
  }
  get coursePrerequisite() {
    return this.client.coursePrerequisite;
  }
  get courseRegistration() {
    return (this.rlsContext.getClient() ?? this.system).courseRegistration;
  }
  get dataSubjectRequest() {
    return (this.rlsContext.getClient() ?? this.system).dataSubjectRequest;
  }
  get degreeVerificationToken() {
    return this.client.degreeVerificationToken;
  }
  get department() {
    return this.client.department;
  }
  get domainEvent() {
    return this.client.domainEvent;
  }
  get donation() {
    return this.client.donation;
  }
  get enterpriseAlert() {
    return this.client.enterpriseAlert;
  }
  get drug() {
    return this.client.drug;
  }
  get examAttendance() {
    return this.client.examAttendance;
  }
  get examCandidate() {
    return this.client.examCandidate;
  }
  get examTimetable() {
    return this.client.examTimetable;
  }
  get examInvigilator() {
    return this.client.examInvigilator;
  }
  get examVenue() {
    return this.client.examVenue;
  }
  get examinationAuthority() {
    return this.client.examinationAuthority;
  }
  get examinationType() {
    return this.client.examinationType;
  }
  get faculty() {
    return this.client.faculty;
  }
  get feeSchedule() {
    return this.client.feeSchedule;
  }
  get feeWaiver() {
    return this.client.feeWaiver;
  }
  get grant() {
    return this.client.grant;
  }
  get grantExpenditure() {
    return this.client.grantExpenditure;
  }
  get gradeUploadBatch() {
    return this.client.gradeUploadBatch;
  }
  get graduationCandidate() {
    return (this.rlsContext.getClient() ?? this.system).graduationCandidate;
  }
  get hostelBlock() {
    return this.client.hostelBlock;
  }
  get institutionSettings() {
    return this.client.institutionSettings;
  }
  get leaveRequest() {
    return this.client.leaveRequest;
  }
  get libraryItem() {
    return this.client.libraryItem;
  }
  get libraryLoan() {
    return this.client.libraryLoan;
  }
  get ltiConfig() {
    return this.client.ltiConfig;
  }
  get medicalRecord() {
    return this.client.medicalRecord;
  }
  get mfaBackupCode() {
    return this.client.mfaBackupCode;
  }
  get notification() {
    return this.client.notification;
  }
  get notificationLog() {
    return this.client.notificationLog;
  }
  get notificationPreference() {
    return this.client.notificationPreference;
  }
  get notificationTemplate() {
    return this.client.notificationTemplate;
  }
  get patient() {
    return this.client.patient;
  }
  get payment() {
    return (this.rlsContext.getClient() ?? this.system).payment;
  }
  get paymentReceiptClaim() {
    return this.client.paymentReceiptClaim;
  }
  get person() {
    return this.client.person;
  }
  get payrollRun() {
    return this.client.payrollRun;
  }
  get payslip() {
    return (this.rlsContext.getClient() ?? this.system).payslip;
  }
  get prescription() {
    return this.client.prescription;
  }
  get programme() {
    return this.client.programme;
  }
  get programmeCourse() {
    return this.client.programmeCourse;
  }
  get reportJob() {
    return this.client.reportJob;
  }
  get ruleExecution() {
    return this.client.ruleExecution;
  }
  get researchMember() {
    return this.client.researchMember;
  }
  get researchOutput() {
    return this.client.researchOutput;
  }
  get researchProject() {
    return this.client.researchProject;
  }
  get room() {
    return this.client.room;
  }
  get roomAllocation() {
    return this.client.roomAllocation;
  }
  get salaryGrade() {
    return this.client.salaryGrade;
  }
  get securityIncident() {
    return (this.rlsContext.getClient() ?? this.system).securityIncident;
  }
  get semester() {
    return this.client.semester;
  }
  get session() {
    return this.client.session;
  }
  get staff() {
    return this.client.staff;
  }
  get staffAllowance() {
    return this.client.staffAllowance;
  }
  get student() {
    return (this.rlsContext.getClient() ?? this.system).student;
  }
  get studentAcademicHistory() {
    return (this.rlsContext.getClient() ?? this.client).studentAcademicHistory;
  }
  get studentClearance() {
    return this.client.studentClearance;
  }
  get studentFee() {
    return this.client.studentFee;
  }
  get studentResult() {
    return (this.rlsContext.getClient() ?? this.system).studentResult;
  }
  get transportRoute() {
    return this.client.transportRoute;
  }
  get trip() {
    return this.client.trip;
  }
  get tripBooking() {
    return this.client.tripBooking;
  }
  get universityPolicy() {
    return this.client.universityPolicy;
  }
  get universityPolicyAcknowledgement() {
    return this.client.universityPolicyAcknowledgement;
  }
  get user() {
    return this.client.user;
  }
  get userRole() {
    return this.client.userRole;
  }
  get roleDelegation() {
    return this.client.roleDelegation;
  }
  get roleConflictRule() {
    return this.client.roleConflictRule;
  }
  get vehicle() {
    return this.client.vehicle;
  }
  get workflowDefinition() {
    return this.client.workflowDefinition;
  }
  get workflowInstance() {
    return this.client.workflowInstance;
  }
  get workflowStep() {
    return this.client.workflowStep;
  }
  get workflowTask() {
    return this.client.workflowTask;
  }

  // ── Client-level method forwarding (the ~450 existing call sites across
  //    the app use these on `this.prisma` directly) ──────────────────────
  // Explicit overloads — NOT `Parameters<PrismaClient['$transaction']>` —
  // because TypeScript's `Parameters<T>` on an overloaded function type only
  // ever sees the LAST signature, silently collapsing the callback-form
  // overload every existing call site in this codebase actually uses
  // (`this.prisma.$transaction(async (tx) => ...)`) down to just the
  // array/batch form. That would make every one of those call sites lose
  // correct type inference for their `tx` callback parameter — not a
  // hypothetical, this was caught by actually running the Jest suite in
  // this pass and seeing it happen (see docs/CHANGELOG.md, P0-4).
  $transaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
    options?: { maxWait?: number; timeout?: number; isolationLevel?: unknown },
  ): Promise<T>;
  $transaction<P extends Prisma.PrismaPromise<any>[]>(
    arr: [...P],
    options?: { isolationLevel?: unknown },
  ): Promise<AwaitedTuple<P>>;
  $transaction(...args: unknown[]): unknown {
    const first = args[0];
    if (typeof first === "function") {
      const ambient = this.rlsContext.getClient();
      if (ambient)
        return (first as (tx: Prisma.TransactionClient) => Promise<unknown>)(
          ambient,
        );
      return (this.system.$transaction as (...a: unknown[]) => unknown)(
        ...args,
      );
    }
    // Batch transactions cannot be rebound to an existing Prisma
    // TransactionClient. They remain for read-only/non-RLS call sites;
    // protected read batches should use Promise.all or runExclusive.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.client.$transaction as any)(...args);
  }
  get $queryRaw() {
    const c = this.rlsContext.getClient() ?? this.system;
    return c.$queryRaw.bind(c);
  }
  get $queryRawUnsafe() {
    const c = this.rlsContext.getClient() ?? this.system;
    return c.$queryRawUnsafe.bind(c);
  }
  get $executeRaw() {
    const c = this.rlsContext.getClient() ?? this.system;
    return c.$executeRaw.bind(c);
  }
  get $executeRawUnsafe() {
    return this.client.$executeRawUnsafe.bind(this.client);
  }
}
