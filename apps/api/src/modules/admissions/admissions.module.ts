import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AuditService } from '../../common/audit/audit.service';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { QUEUE_NAMES } from '../../common/queue-names';
import { isWorkerProcess } from '../../common/runtime/process-role';
import { AdmissionsController } from './admissions.controller';
import { AdmissionsService } from './admissions.service';
import { AdmissionsOpsProcessor } from './jobs/admissions-ops.processor';

@Module({
  imports: [
    OutboxModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.ADMISSIONS_OPS }),
  ],
  controllers: [AdmissionsController],
  providers: [
    AdmissionsService,
    AuditService,
    ...(isWorkerProcess() ? [AdmissionsOpsProcessor] : []),
  ],
  exports:     [AdmissionsService],
})
export class AdmissionsModule {}
