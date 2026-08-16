import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';

import { PrismaService } from './prisma.service';

/**
 * PartitionManagerService — FIX H2 (Critical Evaluation)
 *
 * The v5.0 spec declared monthly RANGE partitions for:
 *   payments, payslips, audit_logs
 * And yearly LIST partitions for:
 *   student_results
 *
 * But had NO automated job to create future partitions.
 * If the partition for the next month does not exist when the first record
 * arrives, PostgreSQL throws: "no partition of relation X found for row"
 * — causing data loss and 500 errors for all affected operations.
 *
 * This service creates the next 3 months of partitions proactively.
 * It runs on the 1st of each month at 00:30 WAT and on application startup.
 *
 * IMPORTANT: Partition DDL is applied via raw SQL — Prisma migrations
 * handle table creation only. Partition management lives here.
 * The initial partition tables must be created in the first raw SQL migration.
 * See: apps/api/prisma/migrations/0001_create_partitioned_tables.sql
 */
@Injectable()
export class PartitionManagerService {
  private readonly logger = new Logger(PartitionManagerService.name);

  // Tables with monthly RANGE partitions.
  // FIX (Evaluation, P4): payments + payslips are NOT YET physically
  // partitioned — see docs/CHANGELOG.md "Payment/Payslip partitioning
  // deferred to P10". isTablePartitioned() below makes this list safe to
  // keep as-is: any table not yet converted to PARTITION BY is skipped
  // with a debug log instead of throwing on every monthly cron run.
  private static readonly MONTHLY_PARTITIONED_TABLES = [
    'payments',
    'payslips',
    'audit_logs',
  ] as const;

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Called on module init AND on cron schedule.
   * Creates partitions for current month + next 2 months (3 total).
   * Idempotent — IF NOT EXISTS prevents errors on re-run.
   */
  async ensurePartitionsExist(): Promise<void> {
    const now = new Date();

    for (let monthOffset = 0; monthOffset <= 2; monthOffset++) {
      const target = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
      await this.ensureMonthlyPartitions(target);
    }

    // Also ensure next 2 academic years exist for student_results
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    const academicStartYear = currentMonth >= 9 ? currentYear : currentYear - 1;
    await this.ensureAcademicYearPartition(academicStartYear);
    await this.ensureAcademicYearPartition(academicStartYear + 1);
  }

  @Cron('30 0 1 * *', { timeZone: 'Africa/Lagos' }) // 00:30 WAT on 1st of each month
  async scheduledPartitionCreation(): Promise<void> {
    this.logger.log('Running scheduled partition creation check');
    await this.ensurePartitionsExist();
  }

  private async ensureMonthlyPartitions(monthStart: Date): Promise<void> {
    const year  = monthStart.getFullYear();
    const month = monthStart.getMonth() + 1;
    const monthStr  = String(month).padStart(2, '0');
    const nextMonth = new Date(year, month, 1);
    const nextYear  = nextMonth.getFullYear();
    const nextMonthStr = String(nextMonth.getMonth() + 1).padStart(2, '0');

    for (const table of PartitionManagerService.MONTHLY_PARTITIONED_TABLES) {
      // FIX (Evaluation, P4): skip gracefully if the parent table has not
      // been converted to PARTITION BY yet (payments/payslips until P10).
      if (!(await this.isTablePartitioned(table))) {
        this.logger.debug(`Skipping partitions for "${table}" — not yet a partitioned table (deferred to P10)`);
        continue;
      }

      const partitionName = `${table}_${year}_${monthStr}`;
      const rangeFrom = `${year}-${monthStr}-01`;
      const rangeTo   = `${nextYear}-${nextMonthStr}-01`;

      try {
        await this.prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS ${partitionName}
          PARTITION OF ${table}
          FOR VALUES FROM ('${rangeFrom}') TO ('${rangeTo}')
        `);
        this.logger.debug(`Partition ensured: ${partitionName}`);
      } catch (err) {
        this.logger.error(`Failed to create partition ${partitionName}: ${String(err)}`);
      }
    }
  }

  /** Returns true if `tableName` is a PostgreSQL partitioned table (relkind='p'). */
  private async isTablePartitioned(tableName: string): Promise<boolean> {
    const rows = await this.prisma.$queryRaw<Array<{ relkind: string }>>`
      SELECT c.relkind FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = ${tableName} AND n.nspname = 'public'
    `;
    return rows[0]?.relkind === 'p';
  }

  private async ensureAcademicYearPartition(startYear: number): Promise<void> {
    const academicYear    = `${startYear}/${startYear + 1}`;
    const partitionSuffix = `${startYear}_${startYear + 1}`;
    const partitionName   = `student_results_${partitionSuffix}`;

    try {
      await this.prisma.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS ${partitionName}
        PARTITION OF student_results
        FOR VALUES IN ('${academicYear}')
      `);
      this.logger.debug(`Academic year partition ensured: ${partitionName}`);
    } catch (err) {
      this.logger.error(
        `Failed to create academic year partition ${partitionName}: ${String(err)}`,
      );
    }
  }
}
