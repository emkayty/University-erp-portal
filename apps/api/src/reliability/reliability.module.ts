import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ReliabilityController } from './reliability.controller';
import { ReliabilityService } from './reliability.service';
import { AuditService } from '../common/audit/audit.service';
import { OutboxModule } from '../common/outbox/outbox.module';
import { DatabaseModule } from '../database/database.module';
import { QUEUE_NAMES } from '../common/queue-names';

@Module({
  imports: [
    DatabaseModule,
    OutboxModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.NOTIFICATIONS },
      { name: QUEUE_NAMES.ADMISSIONS_OPS },
      { name: QUEUE_NAMES.INVOICE_GENERATION },
      { name: QUEUE_NAMES.PAYMENT_RECONCILIATION },
      { name: QUEUE_NAMES.REPORT_GENERATION },
      { name: QUEUE_NAMES.BREACH_NOTIFICATION },
      { name: QUEUE_NAMES.ACADEMIC_PROGRESSION },
    ),
  ],
  controllers: [ReliabilityController],
  providers: [ReliabilityService, AuditService],
})
export class ReliabilityModule {}
