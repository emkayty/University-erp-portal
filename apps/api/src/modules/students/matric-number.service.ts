import { Injectable, Logger } from '@nestjs/common';
import { DirectPrismaService } from '../../database/direct-prisma.service';
import { buildAdvisoryLockKey } from '@uniportal/utils';

/**
 * MatricNumberService — generates unique, sequential matric numbers.
 *
 * Format:  {DEPT_CODE}/{ADMISSION_YEAR}/{SEQUENCE_5_DIGITS}
 * Example: CSC/2025/00001
 *
 * M5 FIX (Advisory Lock + PgBouncer):
 * Uses DirectPrismaService (DATABASE_DIRECT_URL) — a non-pooled connection
 * that bypasses PgBouncer. pg_advisory_xact_lock is session-scoped; PgBouncer
 * transaction mode assigns different backend connections per transaction,
 * making advisory locks ineffective on a pooled connection.
 *
 * The lock key is deterministic per (deptCode, year) pair using a separator
 * to prevent hash collisions (M1 fix: "CSC"+"24" ≠ "CS"+"C24").
 */
@Injectable()
export class MatricNumberService {
  private readonly logger = new Logger(MatricNumberService.name);

  constructor(private readonly direct: DirectPrismaService) {}

  /**
   * Generates the next matric number for a department + admission year.
   * Serialises concurrent calls via PostgreSQL advisory lock.
   *
   * @param departmentCode  e.g. "CSC"
   * @param admissionYear   e.g. "2025" (4-digit start year)
   */
  async generate(departmentCode: string, admissionYear: string): Promise<string> {
    const lockKey = buildAdvisoryLockKey(departmentCode, admissionYear);

    return this.direct.$transaction(async (tx) => {
      // Acquire advisory lock — blocks all other transactions with same key
      // until this transaction commits or rolls back
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockKey}::bigint)`;

      const prefix = `${departmentCode.toUpperCase()}/${admissionYear}`;

      // Count existing students with this dept/year prefix
      const existing = await tx.student.findMany({
        where:  { matricNo: { startsWith: prefix } },
        select: { matricNo: true },
        orderBy: { matricNo: 'desc' },
        take:   1,
      });

      let sequence = 1;
      if (existing.length > 0 && existing[0]) {
        const lastSeq = parseInt(existing[0].matricNo.split('/')[2] ?? '0', 10);
        sequence = lastSeq + 1;
      }

      const matricNo = `${prefix}/${String(sequence).padStart(5, '0')}`;
      this.logger.log(`Generated matric number: ${matricNo}`);
      return matricNo;
    });
  }
}
