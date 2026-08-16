import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { QUEUE_NAMES } from '../../common/queue-names';
import { isWorkerProcess } from '../../common/runtime/process-role';
import { FeeClearanceService } from './fee-clearance.service';
import { FeesController } from './fees.controller';
import { FeesService } from './fees.service';
import { InvoiceGenerationProcessor } from './jobs/invoice-generation.processor';
import { PaymentReconciliationProcessor } from './jobs/payment-reconciliation.processor';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';
import { WebhookVerificationService } from './webhook-verification.service';

@Module({
  imports: [
    OutboxModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.INVOICE_GENERATION },
      { name: QUEUE_NAMES.PAYMENT_RECONCILIATION },
      { name: QUEUE_NAMES.NOTIFICATIONS },
    ),
  ],
  controllers: [FeesController, PaymentsController],
  providers: [
    FeesService, PaymentsService, FeeClearanceService,
    WebhookVerificationService,
    ...(isWorkerProcess()
      ? [InvoiceGenerationProcessor, PaymentReconciliationProcessor]
      : []),
    AuditService,
  ],
  exports: [FeesService, PaymentsService, FeeClearanceService],
})
export class FeesModule {}
