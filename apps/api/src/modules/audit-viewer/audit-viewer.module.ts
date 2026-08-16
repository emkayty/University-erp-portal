import { Module } from '@nestjs/common';
import { AuditViewerController } from './audit-viewer.controller';

/**
 * AuditViewerModule — read-only view of audit_logs.
 * SUPER_ADMIN only. Audit logs are immutable (append-only).
 */
@Module({
  controllers: [AuditViewerController],
})
export class AuditViewerModule {}
