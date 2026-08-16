import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { AuditAction, EmploymentStatus, LeaveStatus } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';

/**
 * Runs independently of HTTP request scope so the worker process can register
 * the leave-return cron reliably. The conditional update makes each daily run
 * idempotent and prevents a concurrent manual update from being overwritten.
 */
@Injectable()
export class HrLeaveRestorationScheduler {
  private readonly logger = new Logger(HrLeaveRestorationScheduler.name);

  constructor(private readonly prisma: PrismaService) {}

  @Cron('0 6 * * *', { timeZone: 'Africa/Lagos' })
  async restoreStaffFromLeave(): Promise<void> {
    const expiredLeaves = await this.prisma.runSystem((tx) => tx.leaveRequest.findMany({
      where: { status: LeaveStatus.APPROVED, endDate: { lt: new Date() } },
      select: { id: true, staffId: true },
    }));

    let restored = 0;
    for (const leave of expiredLeaves) {
      const restoredThisLeave = await this.prisma.runSystem(async (tx) => {
        const update = await tx.staff.updateMany({
          where: { id: leave.staffId, employmentStatus: EmploymentStatus.ON_LEAVE },
          data: { employmentStatus: EmploymentStatus.ACTIVE },
        });
        if (update.count === 0) return false;

        await tx.auditLog.create({
          data: {
            actorId: null,
            action: AuditAction.UPDATE,
            targetTable: 'staff',
            targetId: leave.staffId,
            metadata: { type: 'AUTO_LEAVE_RETURN', leaveId: leave.id },
          },
        });
        return true;
      });
      if (restoredThisLeave) restored++;
    }

    if (restored > 0) {
      this.logger.log(`Automated leave return: restored ${restored} staff to ACTIVE`);
    }
  }
}
