import { Processor, WorkerHost } from '@nestjs/bullmq';
import { createHash } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { FeeStatus, StudentStatus } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { QUEUE_NAMES } from '../../../common/queue-names';

interface GenerateInvoicesJob { feeScheduleId: string }

const BATCH_SIZE = 500;

/**
 * InvoiceGenerationProcessor — bulk-creates StudentFee rows for every ACTIVE
 * student matching a FeeSchedule's (programmeId, level, academicYear) filter.
 *
 * Scales to 20,000 students via:
 *   - Cursor-based pagination (BATCH_SIZE=500 per round-trip)
 *   - createMany({ skipDuplicates: true }) — relies on uq_student_fee
 *     (studentId, feeScheduleId, academicYear) for idempotency. Re-running
 *     this job (e.g. after a partial failure, or if triggered twice) is safe
 *     — already-invoiced students are silently skipped.
 *   - concurrency: 1 — invoice generation is a rare admin operation; running
 *     two generations for overlapping student sets concurrently risks
 *     duplicate-key races on invoiceNo even with skipDuplicates (Postgres
 *     errors on the FIRST conflicting row in a batch with skipDuplicates in
 *     some versions' interaction with unique violations across the whole
 *     batch — concurrency:1 sidesteps this entirely for a low-frequency job).
 *
 * Invoice number format (deterministic, ≤30 chars):
 *   INV-{academicYear without slash}-{feeType first 3}-{studentId first 8}
 *   e.g. INV-20252026-TUI-a1b2c3d4
 * Deterministic per (student, schedule) — re-running produces the SAME
 * invoiceNo, which is what makes skipDuplicates effective.
 */
@Processor(QUEUE_NAMES.INVOICE_GENERATION, { concurrency: 1 })
export class InvoiceGenerationProcessor extends WorkerHost {
  private readonly logger = new Logger(InvoiceGenerationProcessor.name);

  constructor(private readonly prisma: PrismaService) { super(); }

  async process(job: Job<GenerateInvoicesJob>): Promise<{ created: number; skipped: number; totalEligible: number }> {
    const { feeScheduleId } = job.data;
    const schedule = await this.prisma.feeSchedule.findUniqueOrThrow({ where: { id: feeScheduleId } });

    const where = {
      status: StudentStatus.ACTIVE,
      ...(schedule.programmeId ? { programmeId: schedule.programmeId } : {}),
      ...(schedule.level       ? { level: schedule.level }             : {}),
    };

    const totalEligible = await this.prisma.student.count({ where });
    this.logger.log(`Invoice generation: ${totalEligible} eligible student(s) for schedule ${feeScheduleId} (${schedule.feeType}, ${schedule.academicYear})`);

    let created = 0;
    let cursor: string | undefined;

    while (true) {
      const students = await this.prisma.student.findMany({
        where, select: { id: true },
        orderBy: { id: 'asc' },
        take: BATCH_SIZE,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      });

      if (students.length === 0) break;

      const result = await this.prisma.studentFee.createMany({
        data: students.map((s, idx) => ({
          studentId:     s.id,
          feeScheduleId: schedule.id,
          academicYear:  schedule.academicYear,
          amount:        schedule.amount,
          status:        FeeStatus.PENDING,
          dueDate:       schedule.dueDate,
          // Stable across retries and independent of skipped existing rows.
          invoiceNo:     this.buildInvoiceNo(schedule.academicYear, schedule.feeType, schedule.id, s.id),
        })),
        skipDuplicates: true,
      });

      created += result.count;
      cursor          = students[students.length - 1]!.id;
      const progressPct = Math.min(100, Math.round((created / Math.max(totalEligible, 1)) * 100));
      await job.updateProgress(progressPct);

      if (students.length < BATCH_SIZE) break; // last page
    }

    const skipped = totalEligible - created;
    this.logger.log(`Invoice generation complete: ${created} created, ${skipped} already existed (skipDuplicates)`);
    return { created, skipped, totalEligible };
  }

  private buildInvoiceNo(academicYear: string, feeType: string, feeScheduleId: string, studentId: string): string {
    const yearPart = academicYear.replace('/', '');
    const typePart = feeType.slice(0, 3).toUpperCase();
    const stableKey = createHash('sha256')
      .update(`${feeScheduleId}:${studentId}`)
      .digest('hex')
      .slice(0, 32);
    // 49 characters: INV- + year + - + type + - + 32 hex characters.
    return `INV-${yearPart}-${typePart}-${stableKey}`;
  }
}
