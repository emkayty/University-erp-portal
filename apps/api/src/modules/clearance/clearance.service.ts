import {
  BadRequestException, ForbiddenException, Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditAction, RoleName } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type { BlockClearanceItemDto, CreateClearanceItemDto, WaiveClearanceItemDto } from './dto/clearance.dto';
import { evaluateAdministrativeClearance } from './clearance-evaluator';

/**
 * ClearanceModule (spec §15/§13.5) — AUDIT-H3.
 *
 * Did not exist before this fix. Built here because the gap wasn't just
 * "missing feature" — students.service.ts's matriculate() and
 * report-generation.processor.ts's CLEARANCE_STATUS report both already
 * referenced these Prisma models, meaning they were silently no-op'ing
 * (matriculate, via its own try/catch) or would have thrown (the report
 * case, which had none) the moment either path was actually exercised.
 *
 * SCOPE NOTE: this covers the core spec-required surface — item CRUD,
 * per-student checklist, clear/block/waive, graduation-eligibility check,
 * and keeping "Fees Clearance" in sync with Student.feeCleared (see the
 * fee-clearance.service.ts patch alongside this). It does NOT yet wire
 * Library/Hostel auto-clear (library.clearance.updated /
 * hostel.clearance.updated per spec §5.1's module dependency graph) — those
 * modules' own return-processing/checkout flows would need the same
 * "update the StudentClearance row in the same transaction" treatment this
 * fix gave Fees, and that's each module owner's call to make, not something
 * to bolt on speculatively from here.
 */
@Injectable()
export class ClearanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit:  AuditService,
  ) {}

  async listItems() {
    return this.prisma.clearanceItem.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
  }

  async createItem(dto: CreateClearanceItemDto, actorId: string) {
    if (!Object.values(RoleName).includes(dto.responsibleRole as RoleName)) {
      throw new BadRequestException(`Invalid responsibleRole "${dto.responsibleRole}"`);
    }
    const item = await this.prisma.clearanceItem.create({
      data: {
        name: dto.name, description: dto.description,
        responsibleRole: dto.responsibleRole as RoleName,
        isRequiredForGraduation: dto.isRequiredForGraduation ?? true,
        isAutoCleared: dto.isAutoCleared ?? false,
      },
    });
    await this.audit.log({ action: AuditAction.CREATE, targetTable: 'clearance_items', targetId: item.id, newValues: { name: item.name } }, actorId);
    return item;
  }

  /** Full checklist for a student — this is what the graduation-eligibility widget reads. */
  async getStudentClearance(studentId: string, requestedById: string, requestedByRole: string) {
    if (requestedByRole === 'STUDENT') {
      const self = await this.prisma.student.findUnique({ where: { id: studentId }, select: { userId: true } });
      if (!self || self.userId !== requestedById) {
        throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'You may only view your own clearance status' });
      }
    }

    const items = await this.prisma.clearanceItem.findMany({ where: { isActive: true }, orderBy: { sortOrder: 'asc' } });
    const existing = await this.prisma.studentClearance.findMany({ where: { studentId } });
    const byItemId = new Map(existing.map((sc) => [sc.clearanceItemId, sc]));

    const checklist = items.map((item) => ({
      item,
      clearance: byItemId.get(item.id) ?? { status: 'PENDING' as const, clearedAt: null, blockReason: null, waiverReason: null },
    }));

    const requiredItems = checklist.filter((c) => c.item.isRequiredForGraduation);
    const evaluation = evaluateAdministrativeClearance(
      requiredItems.map((item) => item.item.id),
      checklist.map((item) => ({ clearanceItemId: item.item.id, status: item.clearance.status })),
    );

    // Deep-audit fix (Aug 2026): this was named/returned as
    // `eligibleForGraduation` and treated by callers as a full graduation
    // determination, but it only ever checked administrative sign-off
    // (fees/library/hostel/etc.) — never CGPA, credit units earned, or
    // required courses passed. Kept as an explicit alias (not removed) so
    // existing frontend consumers don't silently lose the field, but
    // renamed in spirit: administrativelyCleared is what this actually is.
    // The real academic check now lives in
    // StudentsService.checkAcademicEligibility(), and
    // StudentsService.graduate() is the only place that combines both
    // before actually graduating someone. See
    // docs/CHANGELOG.md finding 1.1.
    return {
      checklist,
      ...evaluation,
      eligibleForGraduation: evaluation.administrativelyCleared,
    };
  }

  async clearItem(studentId: string, clearanceItemId: string, actorId: string, actorRole: string) {
    const item = await this.getItemOrThrow(clearanceItemId);
    this.assertResponsible(item.responsibleRole, actorRole);

    const updated = await this.prisma.studentClearance.upsert({
      where: { studentId_clearanceItemId: { studentId, clearanceItemId } },
      create: { studentId, clearanceItemId, status: 'CLEARED', clearedById: actorId, clearedAt: new Date() },
      update: { status: 'CLEARED', clearedById: actorId, clearedAt: new Date(), blockedById: null, blockedAt: null, blockReason: null },
    });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'student_clearances', targetId: updated.id, newValues: { status: 'CLEARED', item: item.name } }, actorId);
    return updated;
  }

  async blockItem(studentId: string, clearanceItemId: string, dto: BlockClearanceItemDto, actorId: string, actorRole: string) {
    const item = await this.getItemOrThrow(clearanceItemId);
    this.assertResponsible(item.responsibleRole, actorRole);

    const updated = await this.prisma.studentClearance.upsert({
      where: { studentId_clearanceItemId: { studentId, clearanceItemId } },
      create: { studentId, clearanceItemId, status: 'BLOCKED', blockedById: actorId, blockedAt: new Date(), blockReason: dto.blockReason },
      update: { status: 'BLOCKED', blockedById: actorId, blockedAt: new Date(), blockReason: dto.blockReason, clearedById: null, clearedAt: null },
    });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'student_clearances', targetId: updated.id, newValues: { status: 'BLOCKED', reason: dto.blockReason } }, actorId);
    return updated;
  }

  /** Spec §13.5: "VC can WAIVE a clearance item for exceptional circumstances with mandatory reason." */
  async waiveItem(studentId: string, clearanceItemId: string, dto: WaiveClearanceItemDto, actorId: string, actorRole: string) {
    if (actorRole !== 'VC' && actorRole !== 'SUPER_ADMIN') {
      throw new ForbiddenException({ code: 'RBAC_FORBIDDEN', message: 'Only the VC (or super_admin) may waive a clearance item' });
    }
    const item = await this.getItemOrThrow(clearanceItemId);

    const updated = await this.prisma.studentClearance.upsert({
      where: { studentId_clearanceItemId: { studentId, clearanceItemId } },
      create: { studentId, clearanceItemId, status: 'WAIVED', waivedById: actorId, waivedAt: new Date(), waiverReason: dto.waiverReason },
      update: { status: 'WAIVED', waivedById: actorId, waivedAt: new Date(), waiverReason: dto.waiverReason },
    });
    await this.audit.log({ action: AuditAction.UPDATE, targetTable: 'student_clearances', targetId: updated.id, newValues: { status: 'WAIVED', item: item.name, reason: dto.waiverReason } }, actorId);
    return updated;
  }

  async listPending(clearanceItemId?: string) {
    return this.prisma.studentClearance.findMany({
      where: { status: 'PENDING', ...(clearanceItemId ? { clearanceItemId } : {}) },
      include: { student: { select: { matricNo: true, firstName: true, lastName: true } }, clearanceItem: { select: { name: true } } },
      take: 5000,
    });
  }

  private async getItemOrThrow(clearanceItemId: string) {
    const item = await this.prisma.clearanceItem.findUnique({ where: { id: clearanceItemId } });
    if (!item) throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: 'No such clearance item' });
    return item;
  }

  private assertResponsible(responsibleRole: string, actorRole: string): void {
    if (actorRole === 'SUPER_ADMIN' || actorRole === 'REGISTRAR') return; // registrar can act on any item, spec §13.5
    if (actorRole !== responsibleRole) {
      throw new ForbiddenException({
        code: 'RBAC_FORBIDDEN',
        message: `Only ${responsibleRole} (or the Registrar) may act on this clearance item`,
      });
    }
  }
}
