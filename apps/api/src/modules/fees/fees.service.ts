import { InjectQueue } from '@nestjs/bullmq';
import {
  BadRequestException, ConflictException, ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { AuditAction, WaiverStatus } from '@prisma/client';
import { assertWaiverCap, computeWaiverAmount, WaiverCapExceededError } from '@uniportal/utils';
import type { RoleName } from '@uniportal/types';

import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { PrismaService } from '../../database/prisma.service';
import { FeeClearanceService } from './fee-clearance.service';
import type {
  CreateFeeScheduleDto, RequestWaiverDto, UpdateFeeScheduleDto,
} from './dto/fees.dto';

@Injectable()
export class FeesService {
  constructor(
    private readonly prisma:    PrismaService,
    private readonly audit:     AuditService,
    private readonly clearance: FeeClearanceService,
    private readonly outbox:    OutboxService,
  ) {}

  /**
   * P0-14 FIX (this pass — see docs/CHANGELOG.md): wraps
   * assertWaiverCap() (packages/utils — framework-agnostic, throws
   * WaiverCapExceededError) and translates a cap violation into a proper
   * NestJS BadRequestException (HTTP 400) instead of letting a plain Error
   * subclass reach the exception filter uncaught, which NestJS's default
   * filter turns into a generic 500. Both call sites below use this instead
   * of calling assertWaiverCap directly, so a bursar or HOD submitting an
   * over-cap waiver request sees the actual validation message, not a
   * server error.
   */
  private assertWaiverCapOrThrow(waiverPct: number, roleCapPct: number, roleName: string): void {
    try {
      assertWaiverCap(waiverPct, roleCapPct, roleName);
    } catch (err) {
      if (err instanceof WaiverCapExceededError) {
        throw new BadRequestException({ code: 'VALIDATION_FAILED', message: err.message });
      }
      throw err;
    }
  }

  // ── Fee Schedules ────────────────────────────────────────────────────────
  async createSchedule(dto: CreateFeeScheduleDto, actorId: string) {
    if (dto.programmeId) {
      await this.prisma.programme.findUniqueOrThrow({ where: { id: dto.programmeId } });
    }

    const schedule = await this.prisma.feeSchedule.create({
      data: {
        programmeId:  dto.programmeId ?? null,
        level:        dto.level ?? null,
        academicYear: dto.academicYear,
        feeType:      dto.feeType,
        amount:       dto.amount,
        description:  dto.description ?? null,
        dueDate:      dto.dueDate ? new Date(dto.dueDate) : null,
        isActive:     true,
      },
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'fee_schedules', targetId: schedule.id,
      newValues: { feeType: dto.feeType, amount: dto.amount, academicYear: dto.academicYear },
    }, actorId);

    return schedule;
  }

  async updateSchedule(id: string, dto: UpdateFeeScheduleDto, actorId: string) {
    const schedule = await this.prisma.feeSchedule.findUniqueOrThrow({ where: { id } });
    const updated  = await this.prisma.feeSchedule.update({
      where: { id },
      data: {
        ...(dto.amount      !== undefined ? { amount: dto.amount }                       : {}),
        ...(dto.isActive    !== undefined ? { isActive: dto.isActive }                   : {}),
        ...(dto.dueDate     !== undefined ? { dueDate: dto.dueDate ? new Date(dto.dueDate) : null } : {}),
        ...(dto.description !== undefined ? { description: dto.description }            : {}),
      },
    });
    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'fee_schedules', targetId: id,
      oldValues: { amount: schedule.amount.toString() }, newValues: dto as Record<string, unknown>,
    }, actorId);
    return updated;
  }

  async findAllSchedules(academicYear?: string) {
    return this.prisma.feeSchedule.findMany({
      where:   academicYear ? { academicYear } : undefined,
      include: { programme: { select: { name: true, code: true } } },
      orderBy: [{ academicYear: 'desc' }, { feeType: 'asc' }],
    });
  }

  // ── Invoice Generation (BullMQ, idempotent) ─────────────────────────────
  /**
   * Queues bulk invoice generation for all students matching this schedule's
   * (programmeId, level, academicYear). jobId is deterministic per schedule
   * — BullMQ deduplicates if the same generation is triggered twice while
   * the first run is still in flight or already completed within the
   * removeOnComplete retention window.
   */
  async generateInvoices(feeScheduleId: string, actorId: string) {
    const { schedule, eventId } = await this.prisma.$transaction(async (tx) => {
      const schedule = await tx.feeSchedule.findUniqueOrThrow({ where: { id: feeScheduleId } });
      if (!schedule.isActive) {
        throw new BadRequestException('Cannot generate invoices for an inactive fee schedule');
      }
      const eventId = await this.outbox.write(tx, 'fees.invoice_generation_requested', { feeScheduleId });
      return { schedule, eventId };
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'fee_schedules', targetId: feeScheduleId,
      metadata: { type: 'INVOICE_GENERATION_QUEUED', eventId },
    }, actorId);

    return { jobId: eventId, message: `Invoice generation queued for ${schedule.feeType} (${schedule.academicYear})` };
  }

  // ── Student Fees ─────────────────────────────────────────────────────────
  async getStudentFees(studentId: string, academicYear?: string) {
    return this.prisma.studentFee.findMany({
      where: { studentId, ...(academicYear ? { academicYear } : {}) },
      include: {
        feeSchedule: { select: { feeType: true, description: true } },
        waivers:     { where: { status: { not: WaiverStatus.REJECTED } } },
      },
      orderBy: [{ academicYear: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async findFeeById(id: string) {
    return this.prisma.studentFee.findUniqueOrThrow({
      where:   { id },
      include: {
        feeSchedule: true,
        payments:    { orderBy: { createdAt: 'desc' } },
        waivers:     { orderBy: { createdAt: 'desc' } },
        student:     { select: { matricNo: true, firstName: true, lastName: true } },
      },
    });
  }

  // ── Fee Waivers ──────────────────────────────────────────────────────────
  /**
   * Role-based waiver caps (read from InstitutionSettings, set in P2):
   *   - HOD:    up to feeWaiverCapHodPct    (default 30%) — goes to PENDING, needs Bursar approval
   *   - BURSAR: up to feeWaiverCapBursarPct (default 80%) — PENDING for independent approval
   *   - SUPER_ADMIN: treated as BURSAR cap, also requires independent approval
   */
  async requestWaiver(dto: RequestWaiverDto, actorId: string, actorRole: RoleName, actorDepartmentId?: string) {
    const settings = await this.prisma.institutionSettings.findFirstOrThrow();
    let cap: number;
    if (actorRole === 'HOD') cap = settings.feeWaiverCapHodPct.toNumber();
    else if (actorRole === 'BURSAR' || actorRole === 'SUPER_ADMIN') cap = settings.feeWaiverCapBursarPct.toNumber();
    else throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Only HOD, Bursar, or Super Admin may request fee waivers' });
    if (actorRole === 'HOD' && !actorDepartmentId) {
      throw new ForbiddenException({ code: 'RBAC_SCOPE_FORBIDDEN', message: 'HOD fee waivers require a department scope' });
    }
    // No human requester may self-approve a financial waiver. Even BURSAR and
    // SUPER_ADMIN requests remain PENDING and require an independent approver.
    const autoApprove = false;

    const waiver = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM student_fees WHERE id = ${dto.studentFeeId} FOR UPDATE`;
      const fee = await tx.studentFee.findUniqueOrThrow({
        where: { id: dto.studentFeeId },
        include: { student: { select: { departmentId: true } } },
      });
      if (actorRole === 'HOD' && fee.student.departmentId !== actorDepartmentId) {
        throw new ForbiddenException({ code: 'RBAC_SCOPE_FORBIDDEN', message: 'HODs may only request waivers for students in their department' });
      }
      if (fee.status === 'PAID' || fee.status === 'WAIVED') {
        throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'This fee is already settled — cannot apply a waiver' });
      }
      const existingPct = fee.amount.isZero() ? 0 : fee.waiverAmount.div(fee.amount).mul(100).toNumber();
      this.assertWaiverCapOrThrow(existingPct + dto.waiverPct, cap, actorRole);
      const amount = computeWaiverAmount(fee.amount.toNumber(), dto.waiverPct);
      const created = await tx.feeWaiver.create({
        data: {
          studentFeeId: fee.id, requestedById: actorId, waiverPct: dto.waiverPct,
          waiverAmount: amount, reason: dto.reason,
          status: autoApprove ? WaiverStatus.APPROVED : WaiverStatus.PENDING,
          approvedById: autoApprove ? actorId : null,
          decidedAt: autoApprove ? new Date() : null,
        },
      });
      if (autoApprove) {
        await tx.studentFee.update({ where: { id: fee.id }, data: { waiverAmount: fee.waiverAmount.add(amount) } });
        await this.clearance.recomputeStudentFee(tx, fee.id);
      }
      return created;
    });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'fee_waivers', targetId: waiver.id, newValues: { waiverPct: dto.waiverPct, status: waiver.status, role: actorRole } }, actorId);
    return waiver;
  }

  async approveWaiver(waiverId: string, actorId: string, actorRole: RoleName) {
    if (actorRole !== 'BURSAR' && actorRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Only Bursar or Super Admin may approve waivers' });
    }
    const settings = await this.prisma.institutionSettings.findFirstOrThrow();
    await this.prisma.$transaction(async (tx) => {
      // Serialize decisions on the waiver itself before reading status. The
      // student-fee lock below serializes the financial cap/application; both
      // locks are required so two concurrent approvals cannot each observe
      // PENDING and apply the same waiver amount.
      await tx.$queryRaw`SELECT id FROM fee_waivers WHERE id = ${waiverId} FOR UPDATE`;
      const waiver = await tx.feeWaiver.findUniqueOrThrow({ where: { id: waiverId } });
      if (waiver.status !== WaiverStatus.PENDING) {
        throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: `Waiver already ${waiver.status}` });
      }
      if (waiver.requestedById === actorId) {
        throw new ForbiddenException({ code: 'SEGREGATION_OF_DUTIES', message: 'The requester cannot approve their own fee waiver.' });
      }
      await tx.$queryRaw`SELECT id FROM student_fees WHERE id = ${waiver.studentFeeId} FOR UPDATE`;
      const fee = await tx.studentFee.findUniqueOrThrow({ where: { id: waiver.studentFeeId } });
      const existingPct = fee.amount.isZero() ? 0 : fee.waiverAmount.div(fee.amount).mul(100).toNumber();
      this.assertWaiverCapOrThrow(existingPct + waiver.waiverPct.toNumber(), settings.feeWaiverCapBursarPct.toNumber(), actorRole);
      await tx.feeWaiver.update({ where: { id: waiverId }, data: { status: WaiverStatus.APPROVED, approvedById: actorId, decidedAt: new Date() } });
      await tx.studentFee.update({ where: { id: fee.id }, data: { waiverAmount: fee.waiverAmount.add(waiver.waiverAmount) } });
      await this.clearance.recomputeStudentFee(tx, fee.id);
    });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'fee_waivers', targetId: waiverId, newValues: { status: 'APPROVED' } }, actorId);
    return { message: 'Waiver approved and applied' };
  }

  async rejectWaiver(waiverId: string, actorId: string, actorRole: RoleName, note?: string) {
    if (actorRole !== 'BURSAR' && actorRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Only Bursar or Super Admin may reject waivers' });
    }
    await this.prisma.$transaction(async (tx) => {
      const waiver = await tx.feeWaiver.findUniqueOrThrow({ where: { id: waiverId } });
      if (waiver.status !== WaiverStatus.PENDING) {
        throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: `Waiver already ${waiver.status}` });
      }
      if (waiver.requestedById === actorId) {
        throw new ForbiddenException({ code: 'SEGREGATION_OF_DUTIES', message: 'The requester cannot reject their own fee waiver.' });
      }
      await tx.$queryRaw`SELECT id FROM student_fees WHERE id = ${waiver.studentFeeId} FOR UPDATE`;
      await tx.feeWaiver.update({
        where: { id: waiverId },
        data: {
          status: WaiverStatus.REJECTED, approvedById: actorId, decidedAt: new Date(),
          reason: note ? `${waiver.reason}\n\n[Rejection note]: ${note}` : waiver.reason,
        },
      });
    });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'fee_waivers', targetId: waiverId, newValues: { status: 'REJECTED', note } }, actorId);
    return { message: 'Waiver rejected' };
  }

  async findPendingWaivers() {
    return this.prisma.feeWaiver.findMany({
      where:   { status: WaiverStatus.PENDING },
      include: {
        studentFee: {
          select: {
            invoiceNo: true, amount: true, academicYear: true,
            student: { select: { matricNo: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
