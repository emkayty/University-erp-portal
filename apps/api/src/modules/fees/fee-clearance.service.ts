import { Injectable, Logger } from '@nestjs/common';
import { FeeStatus, Prisma } from '@prisma/client';

/**
 * FeeClearanceService — single source of truth for fee-clearance logic.
 *
 * CRITICAL (C5 fix): This is called from INSIDE an existing $transaction
 * (passed as `tx`) by both:
 *   - PaymentsService.confirmPayment()  (payment success)
 *   - FeesService.approveWaiver()       (waiver approval)
 *
 * Never call this outside a transaction — Student.feeCleared must change
 * atomically with the StudentFee row(s) that caused the change. A separate
 * post-commit update (e.g. via EventEmitter2) creates a window where a crash
 * leaves Student.feeCleared=false despite a fully-paid StudentFee, silently
 * blocking course registration until the next payment retriggers recompute.
 */
@Injectable()
export class FeeClearanceService {
  private readonly logger = new Logger(FeeClearanceService.name);

  /**
   * Recomputes a single StudentFee's status from amountPaid + waiverAmount,
   * then checks whether ALL of the student's fees for `academicYear` are
   * PAID or WAIVED — if so, sets Student.feeCleared = true (and false if not,
   * so a reversed payment correctly re-locks registration).
   *
   * @returns whether Student.feeCleared changed as a result
   */
  async recomputeStudentFee(
    tx: Prisma.TransactionClient,
    studentFeeId: string,
  ): Promise<{ feeStatus: FeeStatus; feeCleared: boolean; clearedChanged: boolean }> {
    const fee = await tx.studentFee.findUniqueOrThrow({ where: { id: studentFeeId } });

    const effectiveAmount = fee.amount.sub(fee.waiverAmount); // amount owed after waiver
    let status: FeeStatus;

    if (fee.waiverAmount.gte(fee.amount)) {
      status = FeeStatus.WAIVED;
    } else if (fee.amountPaid.gte(effectiveAmount)) {
      status = FeeStatus.PAID;
    } else if (fee.amountPaid.gt(0)) {
      status = FeeStatus.PARTIAL;
    } else if (fee.dueDate && fee.dueDate < new Date()) {
      status = FeeStatus.OVERDUE;
    } else {
      status = FeeStatus.PENDING;
    }

    if (status !== fee.status) {
      await tx.studentFee.update({ where: { id: studentFeeId }, data: { status } });
    }

    return this.recomputeStudentClearance(tx, fee.studentId, fee.academicYear, status);
  }

  /**
   * Checks all StudentFee rows for (studentId, academicYear) and updates
   * Student.feeCleared accordingly. `latestStatus`/`latestFeeId` let the
   * caller pass the row it just updated so we don't re-read it mid-transaction
   * inconsistently (Prisma reads within a tx see uncommitted writes from the
   * same tx, but passing it explicitly avoids a redundant round-trip).
   */
  async recomputeStudentClearance(
    tx: Prisma.TransactionClient,
    studentId: string,
    academicYear: string,
    _latestStatus?: FeeStatus,
  ): Promise<{ feeStatus: FeeStatus; feeCleared: boolean; clearedChanged: boolean }> {
    const outstanding = await tx.studentFee.count({
      where: {
        studentId, academicYear,
        status: { in: [FeeStatus.PENDING, FeeStatus.PARTIAL, FeeStatus.OVERDUE] },
      },
    });

    const newCleared = outstanding === 0;

    const student = await tx.student.findUniqueOrThrow({
      where: { id: studentId }, select: { feeCleared: true },
    });

    const clearedChanged = student.feeCleared !== newCleared;
    if (clearedChanged) {
      await tx.student.update({ where: { id: studentId }, data: { feeCleared: newCleared } });
      this.logger.log(`Student ${studentId} feeCleared → ${newCleared} (academicYear ${academicYear})`);
    }

    // AUDIT-H3: the Clearance module didn't exist when this file was
    // written, so it only ever touched the Student.feeCleared boolean —
    // the "Fees Clearance" StudentClearance row (what ClearanceModule and
    // the graduation-eligibility check actually read) never got updated in
    // step with it. Same transaction, same idempotent
    // update-if-exists-else-noop shape as the rest of this method — the
    // clearance item row is only touched if it exists (an institution that
    // hasn't seeded "Fees Clearance" via the migration 0010 default set
    // simply skips this, same graceful-absence handling used in
    // students.service.ts's matriculate()).
    const feesItem = await tx.clearanceItem.findFirst({ where: { name: 'Fees Clearance' } });
    if (feesItem) {
      await tx.studentClearance.upsert({
        where: { studentId_clearanceItemId: { studentId, clearanceItemId: feesItem.id } },
        create: {
          studentId, clearanceItemId: feesItem.id,
          status: newCleared ? 'CLEARED' : 'PENDING',
          ...(newCleared ? { clearedAt: new Date() } : {}),
        },
        update: newCleared
          ? { status: 'CLEARED', clearedAt: new Date() }
          : { status: 'PENDING', clearedAt: null },
      });
    }

    return {
      feeStatus:     _latestStatus ?? FeeStatus.PENDING,
      feeCleared:    newCleared,
      clearedChanged,
    };
  }
}
