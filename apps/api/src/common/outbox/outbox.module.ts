import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { QUEUE_NAMES } from '../queue-names';
import { isWorkerProcess } from '../runtime/process-role';
import { OutboxDispatchScheduler } from './outbox-dispatch.scheduler';
import { OutboxService } from './outbox.service';

/**
 * OutboxModule — the one place OutboxService is provided (see the P10 note
 * in outbox.service.ts for why this used to be duplicated per-importer).
 * Any module that writes domain events imports this and injects
 * OutboxService; nothing should import outbox.service.ts's class directly
 * from another module's provider list anymore.
 */
@Module({
  imports:  [BullModule.registerQueue(
    { name: QUEUE_NAMES.NOTIFICATIONS },
    { name: QUEUE_NAMES.ADMISSIONS_OPS },
    { name: QUEUE_NAMES.INVOICE_GENERATION },
    { name: QUEUE_NAMES.PAYMENT_RECONCILIATION },
    { name: QUEUE_NAMES.REPORT_GENERATION },
    { name: QUEUE_NAMES.BREACH_NOTIFICATION },
    { name: QUEUE_NAMES.ACADEMIC_PROGRESSION },
  )],
  providers: [
    OutboxService,
    ...(isWorkerProcess() ? [OutboxDispatchScheduler] : []),
  ],
  exports:   [OutboxService],
})
export class OutboxModule {}
