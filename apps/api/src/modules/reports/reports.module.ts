import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { PrivateObjectStorageService } from '../../common/storage/private-object-storage.service';
import { isWorkerProcess } from '../../common/runtime/process-role';
import { ReportGenerationProcessor } from './jobs/report-generation.processor';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { ReportArtifactService } from './services/report-artifact.service';

/**
 * ReportsModule — Module 18: Reporting & Analytics
 *
 * Provides:
 *  - Synchronous live reports (enrolment, revenue, CGPA, results)
 *  - KPI analytics dashboards (VC, HOD, Student self-service)
 *  - Async BullMQ report generation for large datasets (>10k rows)
 *  - ReportGenerationProcessor worker registered against 'report-generation' queue
 *
 * All heavy asynchronous report queries use PrismaService.readReplica, backed by
 * REPORTING_DATABASE_URL/PRISMA_REPORTING_URL when configured, with the primary
 * database as the explicit development fallback.
 */
@Module({
  imports: [
    OutboxModule,
    BullModule.registerQueue({ name: 'report-generation' }),
  ],
  controllers: [ReportsController],
  providers: [
    ReportsService,
    ReportArtifactService,
    PrivateObjectStorageService,
    ...(isWorkerProcess() ? [ReportGenerationProcessor] : []),
    AuditService,
  ],
  exports: [ReportsService],
})
export class ReportsModule {}
