import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable, Logger, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, ResultStatus, type Prisma } from '@prisma/client';

import { applyRepeatPolicy, computeCgpa, computeGradeForSystem, getDegreeClass, getDegreeClassForSystem } from '@uniportal/utils';
import type { CourseRepeatPolicy } from '@uniportal/utils';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { RlsContextService } from '../../common/rls/rls-context.service';
import type {
  AmendResultDto, BulkResultActionDto, BulkSubmitResultsDto,
  ResultActionDto, SubmitResultDto, WithholdResultDto,
} from './dto/results.dto';

/**
 * ResultsService — full result lifecycle management.
 *
 * FSM (post AUDIT-C2/AUDIT-C3 fix):
 *   DRAFT ──HOD_APPROVE──> HOD_APPROVED
 *   REJECTED ──HOD_APPROVE──> HOD_APPROVED  (re-approval after a fix)
 *   HOD_APPROVED ──DEAN_APPROVE──> DEAN_APPROVED     [only if deanApprovalRequired]
 *   HOD_APPROVED ──SUBMIT_SENATE──> SENATE_PENDING   [only if NOT deanApprovalRequired]
 *   DEAN_APPROVED ──SUBMIT_SENATE──> SENATE_PENDING
 *   {HOD_APPROVED, DEAN_APPROVED, SENATE_PENDING} ──REJECT──> REJECTED
 *   SENATE_PENDING ──SENATE_PUBLISH──> SENATE_PUBLISHED
 *   SENATE_PUBLISHED ──amend()──> SENATE_PUBLISHED   (dedicated method, not a generic action — see below)
 *   SENATE_PUBLISHED ──withhold()──> WITHHELD
 *   WITHHELD ──releaseWithhold()──> SENATE_PUBLISHED
 *
 * AUDIT-C2 FIX: amend()/withhold()/releaseWithhold() did not exist at all
 * before this fix — a SENATE_PUBLISHED result had no path to correction,
 * despite the spec naming result-amendment one of exactly two ⚠ CRITICAL
 * transaction boundaries in the whole system. They're deliberately NOT
 * modelled as entries in the generic processAction() transition table,
 * because — unlike every other transition here — they mutate the actual
 * score/grade and must recompute CGPA in the same transaction; that's a
 * fundamentally different (and heavier) operation than a pure status flip.
 *
 * AUDIT-C3 FIX: InstitutionSettings.deanApprovalRequired existed and was
 * settable via the Settings API but was never read anywhere. Now checked
 * in processAction() to decide whether HOD_APPROVED routes to DEAN_APPROVED
 * or straight to SENATE_PENDING.
 *
 * M1 FIX (pre-existing): recomputeAndApplyCgpa() runs inside the SAME
 * $transaction as whichever status transition triggered it. Student.cgpa
 * and Student.totalCreditUnitsEarned are never stale.
 *
 * P0-2 / P1-1 FIX (this pass — see docs/CHANGELOG.md): two things
 * fixed together, because they compound the same way C2's fix and the gap
 * one layer beneath it did:
 *   1. Every Student/StudentResult access now routes through
 *      `this.prisma.forRequest(this.rlsContext)` (reads) or
 *      `this.prisma.runExclusive(this.rlsContext, ...)` (the four
 *      transactional mutators) instead of the plain client, so this module
 *      is no longer one of the ~25 services that would silently see zero
 *      rows the moment DATABASE_URL points at the RLS-restricted
 *      `uniportal_app` role (see infra/README.md's cutover warning).
 *   2. recomputeAndApplyCgpa() now opens with
 *      `pg_advisory_xact_lock(hashtext(studentId))` — the same pattern
 *      payments.service.ts already used correctly for exactly this class
 *      of race. Without it, two of publishToSenate/amend/withhold/
 *      releaseWithhold firing for the SAME student at nearly the same time
 *      could each read the "before" state of the other's change, each
 *      compute a CGPA that only reflects its own edit, and silently leave
 *      the student's stored CGPA wrong until the next unrelated recompute
 *      happens to touch that student again — no error, no retry, just a
 *      quietly incorrect CGPA. Locking on the student, not the result row,
 *      is deliberate: the shared, racy resource is the cross-result CGPA
 *      read+write on Student, not any individual result.
 */
@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit:  AuditService,
    private readonly outbox: OutboxService,
    private readonly rlsContext: RlsContextService,
  ) {}

  // ── Submit (LECTURER) ──────────────────────────────────────────────────────
  async submitResult(dto: SubmitResultDto, submittedById: string, actorRole: string) {
    const privilegedRoles = new Set(['HOD', 'DEAN', 'REGISTRAR', 'SUPER_ADMIN']);
    const isPrivileged = privilegedRoles.has(actorRole);

    return this.prisma.runExclusive(this.rlsContext, async (tx) => {
      // Serialize attempt-number assignment for the same student/course.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dto.studentId} || ':' || ${dto.courseOfferingId}))`;

      const offering = await tx.courseOffering.findUniqueOrThrow({
        where: { id: dto.courseOfferingId },
        include: { course: { select: { creditUnits: true, code: true } } },
      });
      const student = await tx.student.findUniqueOrThrow({
        where: { id: dto.studentId },
        select: { id: true, status: true },
      });
      if (student.status !== 'ACTIVE' && student.status !== 'REPEATING') {
        throw new UnprocessableEntityException({ code: 'STUDENT_NOT_ACTIVE', message: 'Only active or formally repeating students may receive a result' });
      }
      if (!offering.semesterId || offering.semesterId !== dto.semesterId) {
        throw new BadRequestException({ code: 'SEMESTER_MISMATCH', message: 'Result semester must match the course offering semester' });
      }
      if (!isPrivileged) {
        const assignment = offering.lecturerId
          ? await tx.staff.findFirst({ where: { id: offering.lecturerId, userId: submittedById }, select: { id: true } })
          : null;
        if (!assignment) {
          throw new ForbiddenException({ code: 'OFFERING_NOT_ASSIGNED', message: 'You are not assigned to this course offering' });
        }
      }

      const registration = await tx.courseRegistration.findFirst({
        where: { studentId: dto.studentId, courseOfferingId: dto.courseOfferingId, status: { in: ['REGISTERED', 'COMPLETED'] } },
        select: { id: true },
      });
      if (!registration) {
        throw new UnprocessableEntityException({ code: 'REGISTRATION_REQUIRED', message: 'A valid course registration is required before a result can be entered' });
      }

      const existing = await tx.studentResult.findUnique({
        where: { uq_student_result: { studentId: dto.studentId, courseOfferingId: dto.courseOfferingId, semesterId: dto.semesterId } },
      });
      if (existing && existing.status !== ResultStatus.DRAFT && existing.status !== ResultStatus.REJECTED) {
        throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: `Result is in "${existing.status}" — cannot modify after submission` });
      }

      const settings = await tx.institutionSettings.findFirst({ select: { gradingSystem: true, gradePolicyVersion: true, requireResultValidation: true } });
      const gradingSystem = (settings?.gradingSystem ?? 'NIGERIAN_5_POINT') as 'NIGERIAN_5_POINT' | 'US_4_POINT';
      const { grade, gradePoint } = computeGradeForSystem(dto.score, gradingSystem, dto.absentFromExam);
      if (settings?.requireResultValidation && dto.absentFromExam && dto.score !== 0) {
        throw new BadRequestException({ code: 'ABSENCE_SCORE_CONFLICT', message: 'An absent examination cannot also have a non-zero examination score' });
      }
      let attemptNumber = existing?.attemptNumber ?? 0;
      if (!existing) {
        const priorAttempts = await tx.studentResult.findMany({
          where: { studentId: dto.studentId, courseOffering: { courseId: offering.courseId } },
          select: { attemptNumber: true },
          orderBy: { attemptNumber: 'desc' },
          take: 1,
        });
        attemptNumber = (priorAttempts[0]?.attemptNumber ?? 0) + 1;
      }

      const data = {
        studentId: dto.studentId, courseOfferingId: dto.courseOfferingId, semesterId: dto.semesterId,
        score: dto.score, finalScore: dto.score, grade, gradePoint, creditUnits: offering.course.creditUnits,
        gradingSystemSnapshot: gradingSystem, gradingPolicyVersion: settings?.gradePolicyVersion ?? 1,
        attemptNumber, absentFromExam: dto.absentFromExam ?? false, status: ResultStatus.DRAFT,
        submittedById, approvedByHodId: null, hodApprovedAt: null,
        approvedByDeanId: null, deanApprovedAt: null,
        senatePendingAt: null, senatePublishedAt: null, rejectionReason: null,
      };

      const result = existing
        ? await tx.studentResult.update({ where: { id: existing.id }, data })
        : await tx.studentResult.create({ data });

      await tx.auditLog.create({ data: {
        action: AuditAction.CREATE, targetTable: 'student_results', targetId: result.id,
        newValues: { studentId: dto.studentId, score: dto.score, grade, course: offering.course.code, attemptNumber },
        actorId: submittedById,
      }});
      return result;
    });
  }

  async bulkSubmit(dto: BulkSubmitResultsDto, submittedById: string, actorRole: string) {
    const results = [];
    const errors: string[] = [];
    for (const r of dto.results) {
      try { results.push(await this.submitResult(r, submittedById, actorRole)); }
      catch (err) { errors.push(`${r.studentId}: ${err instanceof Error ? err.message : String(err)}`); }
    }
    return { mode: dto.mode ?? 'BEST_EFFORT', submitted: results.length, failed: errors.length, errors };
  }

  // ── FSM Transitions ────────────────────────────────────────────────────────
  async applyAction(resultId: string, dto: ResultActionDto, actorId: string, actorRole: string) {
    const result = await this.prisma.forRequest(this.rlsContext).studentResult.findUniqueOrThrow({ where: { id: resultId } });
    return this.processAction(result.id, result.status, result.studentId, dto.action, actorId, actorRole, dto.rejectionReason);
  }

  async bulkAction(dto: BulkResultActionDto, actorId: string, actorRole: string) {
    const successes: string[] = [], errors: string[] = [];
    for (const id of dto.resultIds) {
      try {
        const r = await this.prisma.forRequest(this.rlsContext).studentResult.findUniqueOrThrow({ where: { id } });
        await this.processAction(r.id, r.status, r.studentId, dto.action, actorId, actorRole, dto.rejectionReason);
        successes.push(id);
      } catch (err) { errors.push(`${id}: ${err instanceof Error ? err.message : String(err)}`); }
    }
    return { processed: successes.length, failed: errors.length, errors };
  }

  private async processAction(
    resultId: string, currentStatus: ResultStatus, studentId: string,
    action: string, actorId: string, actorRole: string, rejectionReason?: string,
  ) {
    // AUDIT-C3 fix: read the flag that used to be ignored entirely.
    const settings = await this.prisma.institutionSettings.findFirst({
      select: { deanApprovalRequired: true },
    });
    const deanApprovalRequired = settings?.deanApprovalRequired ?? false;

    this.validateTransition(currentStatus, action, actorRole, deanApprovalRequired);

    if (action === 'SENATE_PUBLISH') {
      return this.publishToSenate(resultId, studentId, actorId);
    }
    if (action === 'REJECT') {
      if (!rejectionReason) throw new BadRequestException('Rejection reason is required');
    }

    const statusMap: Record<string, ResultStatus> = {
      HOD_APPROVE:    ResultStatus.HOD_APPROVED,
      DEAN_APPROVE:   ResultStatus.DEAN_APPROVED,
      SUBMIT_SENATE:  ResultStatus.SENATE_PENDING,
      REJECT:         ResultStatus.REJECTED,
    };

    const newStatus = statusMap[action]!;
    const now = new Date();
    const extraFields: Record<string, unknown> = {};
    if (action === 'HOD_APPROVE')   { extraFields['approvedByHodId'] = actorId; extraFields['hodApprovedAt'] = now; }
    if (action === 'DEAN_APPROVE')  { extraFields['approvedByDeanId'] = actorId; extraFields['deanApprovedAt'] = now; }
    if (action === 'SUBMIT_SENATE') { extraFields['senatePendingAt'] = now; }
    if (action === 'REJECT')        { extraFields['rejectionReason'] = rejectionReason; }

    const updated = await this.prisma.forRequest(this.rlsContext).studentResult.update({
      where: { id: resultId },
      data:  { status: newStatus, ...extraFields },
    });
    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'student_results', targetId: resultId,
      newValues: { status: newStatus, action },
    }, actorId);
    return updated;
  }

  /**
   * M1 FIX: Senate publish + CGPA update in ONE $transaction.
   * Academic integrity guarantee — a result can never be published without
   * the student's CGPA reflecting it.
   */
  private async publishToSenate(resultId: string, studentId: string, actorId: string) {
    return this.prisma.runExclusive(this.rlsContext, async (tx) => {
      const published = await tx.studentResult.update({
        where: { id: resultId },
        data:  { status: ResultStatus.SENATE_PUBLISHED, senatePublishedAt: new Date() },
      });

      const { cgpa, totalCreditUnitsEarned } = await this.recomputeAndApplyCgpa(tx, studentId, published.semesterId);

      const eventPayload = { resultId, studentId, semesterId: published.semesterId, courseOfferingId: published.courseOfferingId, cgpa, totalCreditUnitsEarned, publishedAt: published.senatePublishedAt };
      await this.outbox.write(tx, 'result.senate_published', eventPayload);
      await this.outbox.write(tx, 'result.published', eventPayload);
      await this.outbox.write(tx, 'academic.progression.refresh_requested', {
        studentId, resultId, semesterId: published.semesterId, actorId,
        downstream: ['degree-audit', 'academic-standing', 'progression', 'academic-plan', 'graduation-eligibility'],
      });

      await tx.auditLog.create({ data: {
        actorId, action: AuditAction.UPDATE,
        targetTable: 'student_results', targetId: resultId,
        newValues: { status: 'SENATE_PUBLISHED', newCgpa: cgpa, totalCreditUnitsEarned },
      }});

      this.logger.log(
        `Result ${resultId} senate-published. Student ${studentId} CGPA → ${cgpa.toFixed(2)} (${getDegreeClass(cgpa)})`,
      );
      return { result: published, newCgpa: cgpa, totalCreditUnitsEarned };
    });
  }

  /**
   * AUDIT-C2: Result amendment. Spec §11.4 / §7B: "Single transaction:
   * updates result + recalculates CGPA". A published result's score/grade
   * can be corrected (grade appeal, clerical error, exam-board reversal)
   * without ever leaving SENATE_PUBLISHED status — only HOD/Dean/super_admin
   * may do this, and a reason is mandatory for the audit trail.
   */
  async amend(resultId: string, dto: AmendResultDto, actorId: string, actorRole: string) {
    if (!['HOD', 'DEAN', 'SUPER_ADMIN'].includes(actorRole)) {
      throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Only HOD, Dean, or super_admin may amend a published result' });
    }

    const existing = await this.prisma.forRequest(this.rlsContext).studentResult.findUniqueOrThrow({ where: { id: resultId } });
    if (existing.status !== ResultStatus.SENATE_PUBLISHED) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Cannot amend a result in status "${existing.status}" — only SENATE_PUBLISHED results can be amended`,
      });
    }

    const oldScore = existing.score;
    const settings = await this.prisma.institutionSettings.findFirst({ select: { gradingSystem: true, gradePolicyVersion: true } });
    const gradingSystem = (settings?.gradingSystem ?? existing.gradingSystemSnapshot ?? 'NIGERIAN_5_POINT') as 'NIGERIAN_5_POINT' | 'US_4_POINT';
    const { grade, gradePoint } = computeGradeForSystem(dto.newScore, gradingSystem, existing.absentFromExam);

    return this.prisma.runExclusive(this.rlsContext, async (tx) => {
      const amended = await tx.studentResult.update({
        where: { id: resultId },
        data: {
          score: dto.newScore, finalScore: dto.newScore, grade, gradePoint,
          gradingSystemSnapshot: gradingSystem, gradingPolicyVersion: settings?.gradePolicyVersion ?? existing.gradingPolicyVersion,
          resultVersion: existing.resultVersion + 1,
          isAmended: true, amendmentReason: dto.amendmentReason,
          amendedById: actorId, amendedAt: new Date(),
        },
      });

      await tx.resultVersion.create({ data: { studentResultId: resultId, version: amended.resultVersion, score: dto.newScore, grade, gradePoint, reason: dto.amendmentReason, changedById: actorId } });

      const { cgpa, totalCreditUnitsEarned } = await this.recomputeAndApplyCgpa(tx, existing.studentId, existing.semesterId);

      await tx.auditLog.create({ data: {
        actorId, action: AuditAction.UPDATE,
        targetTable: 'student_results', targetId: resultId,
        oldValues: { score: oldScore, grade: existing.grade },
        newValues: { score: dto.newScore, grade, amendmentReason: dto.amendmentReason, newCgpa: cgpa, resultVersion: amended.resultVersion },
      }});

      // Post-commit notification — notifications.processor.ts handles
      // 'result.amended' the same way it handles 'result.senate_published'
      // (see docs/CHANGELOG.md item AUDIT-C1 and
      // notifications.processor.ts for the actual handler).
      await this.outbox.write(tx, 'result.amended', {
        resultId, studentId: existing.studentId, oldScore, newScore: dto.newScore,
        oldGrade: existing.grade, newGrade: grade, cgpa,
      });

      this.logger.log(
        `Result ${resultId} amended by ${actorId}: score ${oldScore}→${dto.newScore}, grade ${existing.grade}→${grade}. ` +
        `Student ${existing.studentId} CGPA → ${cgpa.toFixed(2)}`,
      );
      return { result: amended, newCgpa: cgpa, totalCreditUnitsEarned };
    });
  }

  /**
   * AUDIT-C2: Withhold a published result (spec §11.4: "pending clearance
   * or disciplinary action"). Excludes the result from CGPA while withheld —
   * a withheld result is not one the student can currently rely on, so it
   * shouldn't silently continue inflating/deflating their CGPA in the
   * background.
   */
  async withhold(resultId: string, dto: WithholdResultDto, actorId: string, actorRole: string) {
    if (!['REGISTRAR', 'SUPER_ADMIN'].includes(actorRole)) {
      throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Only the Registrar or super_admin may withhold a result' });
    }
    const existing = await this.prisma.forRequest(this.rlsContext).studentResult.findUniqueOrThrow({ where: { id: resultId } });
    if (existing.status !== ResultStatus.SENATE_PUBLISHED) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Cannot withhold a result in status "${existing.status}" — only SENATE_PUBLISHED results can be withheld`,
      });
    }

    return this.prisma.runExclusive(this.rlsContext, async (tx) => {
      const withheld = await tx.studentResult.update({
        where: { id: resultId },
        data: { status: ResultStatus.WITHHELD, withheldReason: dto.withheldReason, withheldById: actorId, withheldAt: new Date() },
      });
      const { cgpa } = await this.recomputeAndApplyCgpa(tx, existing.studentId, existing.semesterId);
      await tx.auditLog.create({ data: {
        actorId, action: AuditAction.UPDATE, targetTable: 'student_results', targetId: resultId,
        oldValues: { status: 'SENATE_PUBLISHED' }, newValues: { status: 'WITHHELD', reason: dto.withheldReason, newCgpa: cgpa },
      }});
      return withheld;
    });
  }

  /** AUDIT-C2: reverses withhold() once whatever it was pending on clears. */
  async releaseWithhold(resultId: string, actorId: string, actorRole: string) {
    if (!['REGISTRAR', 'SUPER_ADMIN'].includes(actorRole)) {
      throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Only the Registrar or super_admin may release a withheld result' });
    }
    const existing = await this.prisma.forRequest(this.rlsContext).studentResult.findUniqueOrThrow({ where: { id: resultId } });
    if (existing.status !== ResultStatus.WITHHELD) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Result is not withheld (status: "${existing.status}")`,
      });
    }

    return this.prisma.runExclusive(this.rlsContext, async (tx) => {
      const released = await tx.studentResult.update({
        where: { id: resultId },
        data: { status: ResultStatus.SENATE_PUBLISHED, withheldReason: null, withheldById: null, withheldAt: null },
      });
      const { cgpa } = await this.recomputeAndApplyCgpa(tx, existing.studentId, existing.semesterId);
      await tx.auditLog.create({ data: {
        actorId, action: AuditAction.UPDATE, targetTable: 'student_results', targetId: resultId,
        oldValues: { status: 'WITHHELD' }, newValues: { status: 'SENATE_PUBLISHED', newCgpa: cgpa },
      }});
      return released;
    });
  }

  /**
   * Shared CGPA recompute — extracted so publishToSenate/amend/withhold/
   * releaseWithhold can't drift out of sync with each other (all four now
   * change what counts toward CGPA and must use the identical computation).
   * MUST be called from inside the caller's own transaction (via
   * runExclusive) — never standalone, or Student.cgpa can go stale relative
   * to the result change that triggered it (the exact M1 bug this pattern
   * exists to prevent).
   *
   * P1-1 FIX (this pass): opens with an advisory lock on `studentId`,
   * mirroring the pattern payments.service.ts already uses correctly for
   * the same class of problem (see PaymentsService.confirmPayment). Without
   * it, two of this method's four callers firing for the same student at
   * nearly the same time could each read the "before" state of the other's
   * change under READ COMMITTED, each compute a CGPA reflecting only their
   * own edit, and silently leave the student's stored CGPA wrong — no
   * error raised. The lock only needs to be acquired here, not separately
   * in each of the four callers, because this is the one place all four
   * converge on the shared, racy resource (the cross-result CGPA read+write
   * on Student) — each caller's own result-row update is a different row
   * and doesn't need this lock to be correct under MVCC.
   */
  /**
   * Deep-audit fix (Aug 2026): added the semesterId param and the
   * StudentAcademicHistory upsert at the end. Previously this method only
   * ever updated the running Student.cgpa/totalCreditUnitsEarned — no
   * per-semester snapshot (this semester's own GPA, as distinct from
   * cumulative CGPA, plus level/status at that point) was ever recorded
   * anywhere, despite StudentAcademicHistory existing with exactly the
   * columns (gpa AND cgpa as separate fields) a transcript needs for this.
   * getAcademicHistory() in students.service.ts always returned an empty
   * array as a direct result. See docs/CHANGELOG.md finding
   * 1.1. All 4 call sites below were updated to pass their result's
   * semesterId through.
   */
  private assertSingleGradingSystem(results: Array<{ gradingSystemSnapshot?: string | null }>): string {
    const systems = new Set(results.map((result) => result.gradingSystemSnapshot ?? 'NIGERIAN_5_POINT'));
    if (systems.size > 1) {
      throw new UnprocessableEntityException({
        code: 'GRADING_SYSTEM_MIXED',
        message: `Cannot compute CGPA or transcript across mixed grading systems: ${Array.from(systems).sort().join(', ')}. Normalize or correct the published result snapshots first.`,
        gradingSystems: Array.from(systems).sort(),
      });
    }
    return Array.from(systems)[0] ?? 'NIGERIAN_5_POINT';
  }

  private async recomputeAndApplyCgpa(tx: Prisma.TransactionClient, studentId: string, semesterId: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${studentId}))`;

    const [allPublished, settings] = await Promise.all([
      tx.studentResult.findMany({
        where:  { studentId, status: ResultStatus.SENATE_PUBLISHED },
        select: {
          gradePoint: true, creditUnits: true, grade: true, attemptNumber: true,
          gradingSystemSnapshot: true, courseOfferingId: true, senatePublishedAt: true, semesterId: true,
          courseOffering: { select: { courseId: true } },
        },
      }),
      tx.institutionSettings.findFirst({ select: { courseRepeatPolicy: true } }),
    ]);

    this.assertSingleGradingSystem(allPublished);
    const repeatPolicy = (settings?.courseRepeatPolicy ?? 'INCLUDE') as CourseRepeatPolicy;

    const resultsForCgpa = allPublished.map((r) => ({
      courseOfferingId: r.courseOfferingId,
      courseId:         r.courseOffering.courseId,
      attemptNumber:     r.attemptNumber,
      gradePoint:       typeof r.gradePoint === 'object' ? (r.gradePoint as { toNumber(): number }).toNumber() : Number(r.gradePoint),
      creditUnits:      r.creditUnits,
      grade:            r.grade,
      senatePublishedAt: r.senatePublishedAt ?? undefined,
      semesterId:        r.semesterId,
    }));

    const filteredResults = applyRepeatPolicy(resultsForCgpa, repeatPolicy);
    const { cgpa, totalCreditUnitsEarned } = computeCgpa(filteredResults);

    const updatedStudent = await tx.student.update({ where: { id: studentId }, data: { cgpa, totalCreditUnitsEarned } });

    // This-semester-only GPA (as distinct from the cumulative cgpa above) —
    // same repeat-policy-filtered result set, narrowed to just this semester.
    const thisSemesterResults = filteredResults.filter((r) => r.semesterId === semesterId);
    const { cgpa: semesterGpa } = computeCgpa(thisSemesterResults);

    const semester = await tx.semester.findUnique({
      where: { id: semesterId },
      select: { academicYear: true, classStartDate: true },
    });
    if (semester) {
      const history = await tx.studentAcademicHistory.findFirst({ where: { studentId, semesterId } });
      if (history) {
        await tx.studentAcademicHistory.update({ where: { id: history.id }, data: { status: updatedStudent.status, gpa: semesterGpa, cgpa } });
      } else {
        await tx.studentAcademicHistory.create({ data: {
          studentId, semesterId, periodKey: `semester:${semesterId}`, academicYear: semester.academicYear, level: updatedStudent.level,
          status: updatedStudent.status, gpa: semesterGpa, cgpa,
          startDate: semester.classStartDate,
        }});
      }
    } else {
      // Shouldn't happen (semesterId comes from a real StudentResult row),
      // but don't let a missing Semester row break the CGPA update itself.
      this.logger.warn(`recomputeAndApplyCgpa: semester ${semesterId} not found — skipped academic-history snapshot for student ${studentId}`);
    }

    return { cgpa, totalCreditUnitsEarned };
  }

  // ── Queries ────────────────────────────────────────────────────────────────
  async getResultsByOffering(courseOfferingId: string, semesterId: string) {
    return this.prisma.forRequest(this.rlsContext).studentResult.findMany({
      where:   { courseOfferingId, semesterId },
      include: { student: { select: { matricNo: true, firstName: true, lastName: true } } },
      orderBy: { student: { matricNo: 'asc' } },
    });
  }

  async getStudentResults(studentId: string, semesterId?: string) {
    return this.prisma.forRequest(this.rlsContext).studentResult.findMany({
      where: { studentId, ...(semesterId ? { semesterId } : {}) },
      include: {
        courseOffering: { include: { course: { select: { code: true, title: true } } } },
        semester: { select: { name: true, academicYear: true } },
      },
      orderBy: [{ semester: { academicYear: 'desc' } }, { createdAt: 'asc' }],
    });
  }

  async getTranscriptData(studentId: string) {
    const student = await this.prisma.forRequest(this.rlsContext).student.findUniqueOrThrow({
      where:   { id: studentId },
      include: {
        programme: { include: { department: { include: { faculty: true } } } },
        user:      { select: { email: true } },
      },
    });

    const results = await this.prisma.forRequest(this.rlsContext).studentResult.findMany({
      where:   { studentId, status: ResultStatus.SENATE_PUBLISHED },
      include: {
        courseOffering: { include: { course: { select: { code: true, title: true, creditUnits: true } } } },
        semester: { select: { name: true, academicYear: true, semesterNumber: true } },
      },
      orderBy: [{ semester: { academicYear: 'asc' } }, { semester: { semesterNumber: 'asc' } }],
    });

    const gradingSystem = this.assertSingleGradingSystem(results);

    // Group by semester
    const semMap = new Map<string, { semesterName: string; academicYear: string; results: typeof results }>();
    for (const r of results) {
      if (!semMap.has(r.semesterId)) {
        semMap.set(r.semesterId, { semesterName: r.semester.name, academicYear: r.semester.academicYear, results: [] });
      }
      semMap.get(r.semesterId)!.results.push(r);
    }

    const cgpa = typeof student.cgpa === 'object'
      ? (student.cgpa as { toNumber(): number }).toNumber() : Number(student.cgpa);

    return {
      student: {
        matricNo:   student.matricNo,
        fullName:   [student.firstName, student.middleName, student.lastName].filter(Boolean).join(' '),
        programme:  student.programme.name,
        department: student.programme.department.name,
        faculty:    student.programme.department.faculty.name,
        entryYear:  student.entryAcademicYear,
        cgpa,
        gradingSystem,
        degreeClass: getDegreeClassForSystem(cgpa, gradingSystem as any),
        totalCreditUnitsEarned: student.totalCreditUnitsEarned,
      },
      semesters: Array.from(semMap.values()),
    };
  }

  async getCourseReport(courseOfferingId: string, semesterId: string) {
    const results=await this.prisma.forRequest(this.rlsContext).studentResult.findMany({where:{courseOfferingId,semesterId},include:{student:{select:{matricNo:true,firstName:true,lastName:true}}},orderBy:{student:{matricNo:'asc'}}});
    const published=results.filter(r=>r.status===ResultStatus.SENATE_PUBLISHED); const dist=published.reduce<Record<string,number>>((a,r)=>(a[r.grade]=(a[r.grade]??0)+1,a),{});
    const scores=published.map(r=>Number(r.score)); const mean=scores.length?scores.reduce((a,b)=>a+b,0)/scores.length:0;
    return {courseOfferingId,semesterId,total:results.length,published:published.length,pending:results.length-published.length,passRate:published.length?Math.round(published.filter(r=>!['F','ABS'].includes(r.grade)).length/published.length*10000)/100:0,meanScore:Math.round(mean*100)/100,gradeDistribution:dist,results};
  }

  async getSemesterReport(semesterId: string) {
    const results=await this.prisma.forRequest(this.rlsContext).studentResult.findMany({where:{semesterId,status:ResultStatus.SENATE_PUBLISHED},select:{studentId:true,score:true,grade:true,gradePoint:true,creditUnits:true,gradingSystemSnapshot:true,courseOfferingId:true}});
    this.assertSingleGradingSystem(results);
    const byStudent=new Map<string,any[]>(); for(const r of results){if(!byStudent.has(r.studentId))byStudent.set(r.studentId,[]);byStudent.get(r.studentId)!.push(r);}
    const gpas=[]; for(const [studentId,rs] of byStudent){let w=0,cu=0;for(const r of rs){w+=Number(r.gradePoint)*r.creditUnits;cu+=r.creditUnits;}gpas.push({studentId,gpa:cu?Math.round(w/cu*100)/100:0});}
    const dist=results.reduce<Record<string,number>>((a,r)=>(a[r.grade]=(a[r.grade]??0)+1,a),{});
    return {semesterId,totalResults:results.length,students:gpas.length,averageGpa:gpas.length?Math.round(gpas.reduce((a,b)=>a+b.gpa,0)/gpas.length*100)/100:0,gradeDistribution:dist,gpas};
  }

  // ── FSM validation ─────────────────────────────────────────────────────────
  private validateTransition(current: ResultStatus, action: string, role: string, deanApprovalRequired: boolean): void {
    const allowed: Partial<Record<ResultStatus, Array<{ action: string; roles: string[] }>>> = {
      [ResultStatus.DRAFT]:    [{ action: 'HOD_APPROVE', roles: ['HOD','DEAN','SUPER_ADMIN'] }],
      [ResultStatus.REJECTED]: [{ action: 'HOD_APPROVE', roles: ['HOD','DEAN','SUPER_ADMIN'] }],
      [ResultStatus.HOD_APPROVED]: deanApprovalRequired
        ? [
            { action: 'DEAN_APPROVE', roles: ['DEAN','SUPER_ADMIN'] },
            { action: 'REJECT',       roles: ['HOD','DEAN','SUPER_ADMIN'] },
          ]
        : [
            { action: 'SUBMIT_SENATE', roles: ['HOD','DEAN','REGISTRAR','SUPER_ADMIN'] },
            { action: 'REJECT',        roles: ['HOD','DEAN','SUPER_ADMIN'] },
          ],
      [ResultStatus.DEAN_APPROVED]: [
        { action: 'SUBMIT_SENATE', roles: ['DEAN','REGISTRAR','SUPER_ADMIN'] },
        { action: 'REJECT',        roles: ['DEAN','SUPER_ADMIN'] },
      ],
      [ResultStatus.SENATE_PENDING]: [
        { action: 'SENATE_PUBLISH', roles: ['REGISTRAR','VC','SUPER_ADMIN'] },
        { action: 'REJECT',         roles: ['REGISTRAR','VC','SUPER_ADMIN'] },
      ],
    };
    const transitions = allowed[current] ?? [];
    const match = transitions.find((t) => t.action === action);
    if (!match) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Cannot apply "${action}" to a result in status "${current}"${
          current === ResultStatus.SENATE_PUBLISHED || current === ResultStatus.WITHHELD
            ? ' — use amend()/withhold()/releaseWithhold() instead of the generic action endpoint for a published or withheld result'
            : ''
        }`,
      });
    }
    if (!match.roles.includes(role)) {
      throw new ForbiddenException({
        code: 'RBAC_FORBIDDEN',
        message: `Role "${role}" cannot perform "${action}" — required: ${match.roles.join(', ')}`,
      });
    }
  }
}
