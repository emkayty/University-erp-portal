import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { AuditAction, Prisma } from '@prisma/client';
import { Request } from 'express';

import { maskPiiFields } from '@uniportal/utils';

import { PrismaService } from '../../database/prisma.service';
import type { JwtPayload } from '../../../../../packages/types/src/auth.types';

export interface AuditLogEntry {
  action:      AuditAction;
  targetTable: string;
  targetId?:   string;
  oldValues?:  Record<string, unknown>;
  newValues?:  Record<string, unknown>;
  metadata?:   Record<string, unknown>;
}

/**
 * AuditService — centralized audit logging for all domain modules.
 *
 * Rules (ISO 27001 + NDPR):
 *  1. Audit logs are APPEND-ONLY — never update or delete rows.
 *  2. PII fields are masked before storage using maskPiiFields().
 *  3. All auth events, data mutations, exports, and admin actions are logged.
 *  4. actorId is null for system/background jobs.
 *
 * Usage in services:
 *   await this.auditService.log({
 *     action: AuditAction.UPDATE,
 *     targetTable: 'students',
 *     targetId: studentId,
 *     oldValues: { status: 'ACTIVE' },
 *     newValues: { status: 'SUSPENDED' },
 *   });
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Optional() @Inject(REQUEST)
    private readonly request?: Request & { user?: JwtPayload },
  ) {}

  async log(entry: AuditLogEntry, actorIdOverride?: string): Promise<void> {
    const actorId  = actorIdOverride ?? (this.request?.user?.sub ?? null);
    const ip       = this.getClientIp();
    const sessionId = this.request?.user?.jti ?? null;

    try {
      await this.prisma.auditLog.create({
        data: {
          actorId,
          action:      entry.action,
          targetTable: entry.targetTable,
          targetId:    entry.targetId ?? null,
          oldValues:   entry.oldValues ? maskPiiFields(entry.oldValues) as Prisma.InputJsonValue : undefined,
          newValues:   entry.newValues ? maskPiiFields(entry.newValues) as Prisma.InputJsonValue : undefined,
          ipAddress:   ip,
          sessionId,
          metadata:    entry.metadata ? entry.metadata as Prisma.InputJsonValue : undefined,
        },
      });
    } catch (err) {
      // Never throw from audit logging — a failed audit write must not
      // break the business operation. Log and continue.
      this.logger.error(
        `Failed to write audit log [${entry.action} on ${entry.targetTable}]: ${String(err)}`,
      );
    }
  }

  /** Logs a system event (no actor — e.g. BullMQ job, scheduled task). */
  async logSystem(entry: AuditLogEntry): Promise<void> {
    return this.log(entry, undefined);
  }

  private getClientIp(): string | null {
    if (!this.request) return null;
    const forwarded = this.request.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') return forwarded.split(',')[0]?.trim() ?? null;
    return this.request.ip ?? null;
  }
}
