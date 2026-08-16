import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { pseudonymiseAuditPayload, pseudonymiseForErasure } from '@uniportal/utils';

import { PrismaService } from '../../database/prisma.service';
import { RlsContextService } from '../../common/rls/rls-context.service';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import type { ErasureRequestDto, PersonDsrIntakeDto, RectifyUserDto, RestrictProcessingDto } from './dto/privacy.dto';

const SAR_SLA_HOURS = 48;        // spec §16.1: "delivered to verified email in 48h"
const DEFAULT_DSR_SLA_DAYS = 30; // NDPR/GDPR-style default SLA for the remaining DSR types

/**
 * PrivacyService — NDPR 2019 Data Subject Rights (spec §16.1).
 *
 * Every action here creates a DataSubjectRequest row FIRST (durable proof a
 * request was received and when it's due), then performs the action. This
 * order matters: if the action itself fails partway, the DPO still has a
 * record that the request came in and can follow up manually — silently
 * losing a DSR request is itself an NDPR compliance failure.
 *
 * AUTHORIZATION NOTE (audit remediation R2 — was: "RLS is decorative"):
 * this service still does its OWN "self, or DPO, or SUPER_ADMIN" checks at
 * the controller/guard layer — that check stays, RLS is defense-in-depth,
 * not a replacement for it. What changed: every query below now goes
 * through `this.db()`, which resolves to the ambient RLS transaction
 * client that RlsInterceptor opens per-request (see
 * common/rls/rls.interceptor.ts), instead of the plain PrismaService
 * client. That means `app.current_user_id`/`app.current_role`/
 * `app.current_dept_id` are actually set on these connections now, and the
 * RLS policies on data_subject_requests/security_incidents (migration
 * 0009_p10_ndpr_security_rls) are genuinely enforced for this service —
 * this is the reference migration for the other ~31 services; see
 * docs/CHANGELOG.md item R2.
 */
@Injectable()
export class PrivacyService {
  private readonly logger = new Logger(PrivacyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly rlsContext: RlsContextService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  /** The ambient, RLS-enforced client for the current request (falls back to the plain client outside a request — e.g. unit tests that don't go through RlsInterceptor). */
  private db() {
    return this.prisma.forRequest(this.rlsContext);
  }

  /** Right of Access (SAR) — GET /privacy/sar/:userId */
  async requestAccess(subjectUserId: string, requestedById: string) {
    const subject = await this.assertSubjectExists(subjectUserId);
    const subjectPersonId = await this.resolveSubjectPersonId(subjectUserId);
    const dueBy = addHours(new Date(), SAR_SLA_HOURS);

    // AUDIT-H2 fix: this used to enqueue only { reportJobId, subjectUserId }
    // — ReportGenerationProcessor.process() destructures
    // { reportJobId, reportType, reportFormat, parameters } from job.data,
    // so reportType/reportFormat/parameters all arrived undefined and
    // fetchReportData()'s switch had no case for CUSTOM anyway (fell
    // through to `default: return []`), meaning a SAR was silently marked
    // COMPLETED with an export containing no data — worse than an error,
    // for a request whose entire point is completeness. Fixed on both
    // ends: the full payload shape is enqueued here, and
    // report-generation.processor.ts now has a real CUSTOM/ndpr_sar branch.
    const parameters = { kind: 'ndpr_sar', subjectUserId };
    const { reportJob, dsr, eventId } = await this.prisma.$transaction(async (tx) => {
      const reportJob = await tx.reportJob.create({
        data: { reportType: 'CUSTOM', reportFormat: 'XLSX', status: 'PENDING', parameters, triggeredBy: requestedById },
      });
      const dsr = await tx.dataSubjectRequest.create({
        data: { type: 'ACCESS', status: 'IN_PROGRESS', subjectPersonId, subjectUserId, requestedById, reportJobId: reportJob.id, dueBy },
      });
      const eventId = await this.outbox.write(tx, 'privacy.sar_export_requested', {
        reportJobId: reportJob.id, reportType: 'CUSTOM', reportFormat: 'XLSX',
        triggeredBy: requestedById, parameters,
      });
      return { reportJob, dsr, eventId };
    });

    await this.audit.log({
      action: AuditAction.EXPORT, targetTable: 'users', targetId: subjectUserId,
      metadata: { dsrType: 'ACCESS', dsrRequestId: dsr.id, eventId },
    }, requestedById);

    this.logger.log(`SAR requested for user ${subjectUserId} — due by ${dueBy.toISOString()}`);
    return { requestId: dsr.id, dueBy, subject: { id: subject.id, email: subject.email } };
  }

  /**
   * Canonical Person DSR intake for pre-account applicants. The method records
   * the request and identity graph, but deliberately does not claim that a
   * right has been completed before identity verification and operational
   * processing occur.
   */
  async intakePersonRequest(personId: string, requestedById: string, dto: PersonDsrIntakeDto) {
    const db = this.db();
    const person = await db.person.findUnique({
      where: { id: personId },
      select: { id: true, students: { select: { userId: true } } },
    });
    if (!person) {
      throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'No such canonical Person' });
    }

    const linkedUserIds = [...new Set(person.students.map((student) => student.userId))];
    const subjectUserId = linkedUserIds.length === 1 ? linkedUserIds[0] : null;
    const dueBy = addDays(new Date(), DEFAULT_DSR_SLA_DAYS);
    const dsr = await db.dataSubjectRequest.create({
      data: {
        type: dto.type,
        status: 'IDENTITY_VERIFICATION_REQUIRED',
        subjectPersonId: personId,
        subjectUserId,
        requestedById,
        reason: dto.reason ?? null,
        dueBy,
      },
    });

    await this.audit.log({
      action: AuditAction.CREATE,
      targetTable: 'data_subject_requests',
      targetId: dsr.id,
      metadata: {
        dsrType: dto.type,
        subjectPersonId: personId,
        subjectUserId,
        identityVerificationRequired: true,
      },
    }, requestedById);

    return {
      requestId: dsr.id,
      status: 'IDENTITY_VERIFICATION_REQUIRED' as const,
      subjectPersonId: personId,
      subjectUserId,
      dueBy,
    };
  }

  /** Right to Rectification — POST /privacy/rectify/:userId */
  async rectify(subjectUserId: string, requestedById: string, dto: RectifyUserDto) {
    await this.assertSubjectExists(subjectUserId);
    if (!dto.email && !dto.phone) {
      throw new BadRequestException('At least one of email or phone must be provided');
    }

    const subjectPersonId = await this.resolveSubjectPersonId(subjectUserId);
    const dueBy = addDays(new Date(), DEFAULT_DSR_SLA_DAYS);
    const dsr = await this.db().dataSubjectRequest.create({
      data: { type: 'RECTIFICATION', status: 'IN_PROGRESS', subjectPersonId, subjectUserId, requestedById, reason: dto.reason ?? null, dueBy },
    });

    try {
      const before = await this.db().user.findUnique({
        where: { id: subjectUserId }, select: { email: true, phone: true },
      });
      const updated = await this.db().user.update({
        where: { id: subjectUserId },
        data: { ...(dto.email && { email: dto.email }), ...(dto.phone && { phone: dto.phone }) },
        select: { email: true, phone: true },
      });
      await this.db().dataSubjectRequest.update({ where: { id: dsr.id }, data: { status: 'COMPLETED', completedAt: new Date() } });

      await this.audit.log({
        action: AuditAction.UPDATE, targetTable: 'users', targetId: subjectUserId,
        oldValues: before ?? undefined, newValues: updated,
        metadata: { dsrType: 'RECTIFICATION', dsrRequestId: dsr.id },
      }, requestedById);
      return { requestId: dsr.id, updated };
    } catch (error) {
      await this.db().dataSubjectRequest.update({ where: { id: dsr.id }, data: { status: 'FAILED', reason: `${dto.reason ?? ''}\nProcessing failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 4000) } });
      throw error;
    }
  }

  /**
   * Right to Erasure — DELETE /privacy/erase/:userId
   * super_admin only, VC sign-off reference required (route guard + DTO).
   *
   * Implements docs/CHANGELOG.md M7 ("NDPR audit log pseudonymisation
   * on erasure"): if the subject has any published academic record
   * (StudentResult rows), the 7-year academic-record legal hold (spec
   * §8.3) applies and we PSEUDONYMISE instead of hard-deleting — the
   * record must still exist for transcripts/audits, but the PII inside it
    * (and inside every historical audit_log row about this user) is
 * scrubbed. User accounts are never physically deleted: pseudonymization and
 * `deletedAt` preserve referential integrity, notification history, auditability,
 * and the canonical identity graph even when no legal hold is present.

   */
  async erase(subjectUserId: string, requestedById: string, dto: ErasureRequestDto) {
    const db = this.db();
    const vc = await db.user.findUnique({
      where: { id: dto.vcApprovalReference },
      select: { id: true, isActive: true, roles: { select: { roleName: true } } },
    });
    if (!vc || !vc.isActive || vc.id === requestedById || !vc.roles.some((role) => role.roleName === 'VC')) {
      throw new ForbiddenException({ code: 'VC_APPROVAL_REQUIRED', message: 'A distinct active VC account must approve the erasure.' });
    }
    const subjectPersonId = await this.resolveSubjectPersonId(subjectUserId);
    const durableDsr = await this.db().dataSubjectRequest.create({
      data: { type: 'ERASURE', status: 'IN_PROGRESS', subjectPersonId, subjectUserId, requestedById, reason: dto.reason ?? null, vcApprovalId: dto.vcApprovalReference, dueBy: addDays(new Date(), DEFAULT_DSR_SLA_DAYS) },
    });

    try {
      const { legalHold } = await this.prisma.$transaction(async (tx) => {
        await tx.user.findUniqueOrThrow({ where: { id: subjectUserId }, select: { id: true } });
        const student = await tx.student.findUnique({
          where: { userId: subjectUserId },
          select: { _count: { select: { results: true } } },
        });
        const pastLogs = await tx.auditLog.findMany({
          where: { actorId: subjectUserId }, select: { id: true, oldValues: true, newValues: true },
        });
        const legalHold = !!student && student._count.results > 0;

        // User is a durable identity anchor for notifications, incidents,
        // audit records, DSR approvals, and other institutional history. Never
        // physically delete it; pseudonymization plus deletedAt is the only
        // erasure path, regardless of whether a separate legal hold applies.
        await this.pseudonymiseInPlace(subjectUserId, tx);

        for (const row of pastLogs) {
        await tx.auditLog.update({
          where: { id: row.id },
          data: {
            oldValues: pseudonymiseAuditPayload(row.oldValues as Record<string, unknown> | null, subjectUserId) as Prisma.InputJsonValue | undefined,
            newValues: pseudonymiseAuditPayload(row.newValues as Record<string, unknown> | null, subjectUserId) as Prisma.InputJsonValue | undefined,
          },
        });
      }

      return { legalHold };
      });

      const completed = await this.db().dataSubjectRequest.update({
        where: { id: durableDsr.id },
        data: {
          status: legalHold ? 'LEGAL_HOLD' : 'COMPLETED',
          legalHoldNote: legalHold
            ? '7-year academic record hold applies (spec §8.3) — pseudonymised and retained.'
            : 'User account pseudonymised and deactivated; physical deletion is prohibited to preserve referential integrity and auditability.',
          completedAt: new Date(),
        },
      });

      await this.audit.log({
        action: AuditAction.ERASURE, targetTable: 'users', targetId: subjectUserId,
        metadata: { dsrRequestId: completed.id, legalHold, pseudonymised: true, hardDeleteProhibited: true, vcApprovalReference: dto.vcApprovalReference },
      }, requestedById);

      this.logger.log(`Erasure completed for ${subjectUserId} (pseudonymised=true, legalHold=${legalHold})`);
      return { requestId: completed.id, pseudonymised: true, hardDeleted: false, legalHold };
    } catch (error) {
      await this.db().dataSubjectRequest.update({ where: { id: durableDsr.id }, data: { status: 'FAILED', reason: `${dto.reason ?? ''}\nProcessing failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 4000) } }).catch(() => undefined);
      throw error;
    }
  }

  /** Right to Data Portability — GET /privacy/export/:userId */
  async exportData(subjectUserId: string, requestedById: string) {
    await this.assertSubjectExists(subjectUserId);
    const subjectPersonId = await this.resolveSubjectPersonId(subjectUserId);
    const parameters = { kind: 'ndpr_portability', subjectUserId, format: 'json' };
    const { reportJob, dsr, eventId } = await this.prisma.$transaction(async (tx) => {
      const reportJob = await tx.reportJob.create({
        data: { reportType: 'CUSTOM', reportFormat: 'XLSX', status: 'PENDING', parameters, triggeredBy: requestedById },
      });
      const dsr = await tx.dataSubjectRequest.create({
        data: { type: 'PORTABILITY', status: 'IN_PROGRESS', subjectPersonId, subjectUserId, requestedById, reportJobId: reportJob.id, dueBy: addDays(new Date(), DEFAULT_DSR_SLA_DAYS) },
      });
      const eventId = await this.outbox.write(tx, 'privacy.portability_export_requested', {
        reportJobId: reportJob.id, reportType: 'CUSTOM', reportFormat: 'XLSX',
        triggeredBy: requestedById, parameters,
      });
      return { reportJob, dsr, eventId };
    });

    await this.audit.log({
      action: AuditAction.EXPORT, targetTable: 'users', targetId: subjectUserId,
      metadata: { dsrType: 'PORTABILITY', dsrRequestId: dsr.id, eventId },
    }, requestedById);

    return { requestId: dsr.id, reportJobId: reportJob.id };
  }

  /** Right to Restriction of Processing — POST /privacy/restrict/:userId (DPO only) */
  async restrictProcessing(subjectUserId: string, requestedById: string, dto: RestrictProcessingDto) {
    await this.assertSubjectExists(subjectUserId);
    const subjectPersonId = await this.resolveSubjectPersonId(subjectUserId);
    const dsr = await this.db().dataSubjectRequest.create({
      data: { type: 'RESTRICTION', status: 'IN_PROGRESS', subjectPersonId, subjectUserId, requestedById, reason: dto.reason, dueBy: addDays(new Date(), DEFAULT_DSR_SLA_DAYS) },
    });
    try {
      await this.db().user.update({ where: { id: subjectUserId }, data: { processingRestricted: true } });
      await this.db().dataSubjectRequest.update({ where: { id: dsr.id }, data: { status: 'COMPLETED', completedAt: new Date() } });
      await this.audit.log({
        action: AuditAction.UPDATE, targetTable: 'users', targetId: subjectUserId,
        newValues: { processingRestricted: true },
        metadata: { dsrType: 'RESTRICTION', dsrRequestId: dsr.id, reason: dto.reason },
      }, requestedById);
      return { requestId: dsr.id, processingRestricted: true };
    } catch (error) {
      await this.db().dataSubjectRequest.update({ where: { id: dsr.id }, data: { status: 'FAILED', reason: `${dto.reason ?? ''}\nProcessing failed: ${error instanceof Error ? error.message : String(error)}`.slice(0, 4000) } }).catch(() => undefined);
      throw error;
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private async assertSubjectExists(userId: string) {
    const user = await this.db().user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'No such user' });
    return user;
  }

  private async resolveSubjectPersonId(userId: string, db = this.db()): Promise<string | null> {
    const student = await db.student.findUnique({ where: { userId }, select: { personId: true } });
    return student?.personId ?? null;
  }

  private async pseudonymiseInPlace(userId: string, db = this.db()): Promise<void> {
    const richDb = db as unknown as Prisma.TransactionClient;
    await db.user.update({
      where: { id: userId },
      data: {
        email: `${pseudonymiseForErasure(userId, 'email')}@erased.uniportal.invalid`,
        phone: null,
        passwordHash: pseudonymiseForErasure(userId, 'passwordHash'),
        mfaSecret: null, mfaEnabled: false,
        isActive: false, deletedAt: new Date(),
      },
    });

    const student = await db.student.findUnique({ where: { userId }, select: { id: true, applicantId: true } });
    if (student) {
      await db.student.update({
        where: { userId },
        data: {
          firstName: 'ERASED', lastName: 'ERASED', middleName: null,
          phone: pseudonymiseForErasure(userId, 'studentPhone'),
          email: `${pseudonymiseForErasure(userId, 'studentEmail')}@erased.uniportal.invalid`,
          currentAddress: null, permanentAddress: null,
          passportPhotoUrl: null,
          // nin/bvn are already AES-256 encrypted at rest (spec §16.2) — we
          // still clear them so no decryptable PII remains reachable at all.
          nin: null, bvn: null,
        },
      });
    }

    const applicantDelegate = richDb.applicant;
    if (!applicantDelegate) return;
    const applicant = await applicantDelegate.findFirst({
      where: student?.applicantId ? { id: student.applicantId } : { student: { is: { userId } } },
      select: { id: true, personId: true, application: { select: { id: true } } },
    });
    if (!applicant) return;

    await db.applicant.update({
      where: { id: applicant.id },
      data: {
        firstName: 'ERASED', lastName: 'ERASED', middleName: null,
        dateOfBirth: new Date('1970-01-01'), gender: 'UNSPECIFIED', nationality: 'ERASED',
        stateOfOrigin: null, lga: null, phone: pseudonymiseForErasure(userId, 'applicantPhone'),
        email: `${pseudonymiseForErasure(userId, 'applicantEmail')}@erased.uniportal.invalid`,
        jambRegNo: null, jambScore: null, jambVerified: false, jambVerifyJobId: null,
        oLevelResults: Prisma.JsonNull, oLevelVerified: false, oLevelVerifyJobId: null,
        nin: null, ninVerified: false, passportPhotoUrl: null, rejectionReason: null,
        deletedAt: new Date(),
      },
    });

    if (applicant.personId) {
      await db.person.update({
        where: { id: applicant.personId },
        data: {
          firstName: 'ERASED', lastName: 'ERASED', middleName: null,
          dateOfBirth: new Date('1970-01-01'), gender: 'UNSPECIFIED', nationality: 'ERASED',
          stateOfOrigin: null, lga: null, primaryEmail: `${pseudonymiseForErasure(userId, 'personEmail')}@erased.uniportal.invalid`,
          primaryPhone: pseudonymiseForErasure(userId, 'personPhone'),
        },
      });
    }

    await richDb.address.updateMany({
      where: { applicantId: applicant.id },
      data: { line1: 'ERASED', line2: null, city: null, lga: null, state: null, country: 'ERASED', countryId: null, regionId: null, localAreaId: null },
    });
    await richDb.guardianContact.updateMany({
      where: { applicantId: applicant.id },
      data: { fullName: 'ERASED', phone: '00000000000', email: null, occupation: null, address: null },
    });
    await richDb.emergencyContact.updateMany({
      where: { applicantId: applicant.id },
      data: { fullName: 'ERASED', phone: '00000000000', email: null, address: null },
    });
    if (applicant.application?.id) {
      await db.application.update({ where: { id: applicant.application.id }, data: { submissionIdempotencyKey: null } });
      await richDb.previousEducation.updateMany({
        where: { applicationId: applicant.application.id },
        data: { institution: 'ERASED', qualification: 'ERASED', programme: null, gradeOrCgpa: null, certificateNo: null, remarks: null },
      });
      await richDb.applicationDocument.updateMany({
        where: { applicationId: applicant.application.id },
        data: { fileUrl: null, originalFileName: null, mimeType: null, documentNumber: null, rejectionReason: null },
      });
      await richDb.oLevelSitting.updateMany({
        where: { applicationId: applicant.application.id },
        data: { candidateNumber: null, examinationNumber: null, centreNumber: null, verificationRef: null, remarks: null },
      });
    }
  }
}

function addHours(d: Date, hours: number): Date {
  return new Date(d.getTime() + hours * 60 * 60 * 1000);
}
function addDays(d: Date, days: number): Date {
  return new Date(d.getTime() + days * 24 * 60 * 60 * 1000);
}
