import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { QUEUE_NAMES } from '../../common/queue-names';
import { isWorkerProcess } from '../../common/runtime/process-role';
import { BreachNotificationProcessor } from './jobs/breach-notification.processor';
import { SecurityController } from './security.controller';
import { SecurityIncidentsService } from './security-incidents.service';

@Module({
  imports: [
    OutboxModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.BREACH_NOTIFICATION }),
  ],
  controllers: [SecurityController],
  providers: [
    SecurityIncidentsService,
    AuditService,
    ...(isWorkerProcess() ? [BreachNotificationProcessor] : []),
  ],
  exports: [SecurityIncidentsService],
})
export class SecurityModule {}
