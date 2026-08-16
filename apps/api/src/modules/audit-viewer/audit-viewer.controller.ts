import {
  Controller, DefaultValuePipe, Get, ParseIntPipe,
  ParseUUIDPipe, Param, Query, UseGuards,
} from '@nestjs/common';
import { AuditAction, Prisma } from '@prisma/client';
import { Roles } from '../../common/decorators';
import { RolesGuard } from '../../common/guards/roles.guard';
import { PrismaService } from '../../database/prisma.service';
import type { AuditLogQueryDto } from '../reports/dto/reports.dto';

/**
 * AuditViewerController — read-only view of the immutable audit_logs table.
 * Restricted exclusively to SUPER_ADMIN.
 * Audit logs are append-only — no PATCH/DELETE endpoints exist.
 */
@Roles('SUPER_ADMIN')
@UseGuards(RolesGuard)
@Controller({ path: 'audit-logs', version: '1' })
export class AuditViewerController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /api/v1/audit-logs
   * Filtered, paginated audit log viewer.
   * Supports: actorId, action, targetTable, targetId, dateFrom, dateTo.
   */
  @Get()
  async getLogs(@Query() query: AuditLogQueryDto) {
    const {
      actorId, action, targetTable, targetId,
      dateFrom, dateTo,
      page = 1, pageSize = 50,
    } = query;

    const where: Record<string, unknown> = {};
    if (actorId)     where['actorId']     = actorId;
    if (action)      where['action']      = action as AuditAction;
    if (targetTable) where['targetTable'] = targetTable;
    if (targetId)    where['targetId']    = targetId;
    if (dateFrom || dateTo) {
      where['createdAt'] = {
        ...(dateFrom ? { gte: new Date(dateFrom) } : {}),
        ...(dateTo   ? { lte: new Date(dateTo) }   : {}),
      };
    }

    const [logs, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        where:   where as Prisma.AuditLogWhereInput,
        orderBy: { createdAt: 'desc' },
        skip:    (page - 1) * pageSize,
        take:    pageSize,
        include: {
          // Include actor name for readability
          actor: { select: { email: true } },
        },
      }),
      this.prisma.auditLog.count({
        where: where as Prisma.AuditLogWhereInput,
      }),
    ]);

    return { logs, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
  }

  /**
   * GET /api/v1/audit-logs/summary
   * Count of actions by type over the last 30 days — used in admin dashboard.
   */
  @Get('summary')
  async getSummary() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [byAction, byTable, recentLogins, totalLast30d] = await this.prisma.$transaction([
      this.prisma.auditLog.groupBy({
        by:     ['action'],
        where:  { createdAt: { gte: since } },
        _count: { action: true },
        orderBy: { _count: { action: 'desc' } },
      }),
      this.prisma.auditLog.groupBy({
        by:     ['targetTable'],
        where:  { createdAt: { gte: since } },
        _count: { targetTable: true },
        orderBy: { _count: { targetTable: 'desc' } },
        take:   10,
      }),
      this.prisma.auditLog.count({
        where: { action: AuditAction.LOGIN, createdAt: { gte: since } },
      }),
      this.prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
    ]);

    return {
      totalLast30Days: totalLast30d,
      recentLogins,
      byAction:  byAction.map((r) => ({ action: r.action, count: r._count.action })),
      topTables: byTable.map((r)  => ({ table: r.targetTable, count: r._count.targetTable })),
    };
  }

  /**
   * GET /api/v1/audit-logs/:id
   * Retrieve a single audit log entry.
   */
  @Get(':id')
  getLog(@Param('id', ParseUUIDPipe) id: string) {
    return this.prisma.auditLog.findUniqueOrThrow({
      where:   { id },
      include: { actor: { select: { email: true } } },
    });
  }
}
