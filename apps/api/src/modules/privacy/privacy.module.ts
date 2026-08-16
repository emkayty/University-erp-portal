import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { AuditService } from '../../common/audit/audit.service';
import { OutboxModule } from '../../common/outbox/outbox.module';
import { QUEUE_NAMES } from '../../common/queue-names';
import { PrivacyController } from './privacy.controller';
import { PrivacyService } from './privacy.service';

@Module({
  imports: [
    OutboxModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.REPORT_GENERATION }),
  ],
  controllers: [PrivacyController],
  providers: [PrivacyService, AuditService],
  exports: [PrivacyService],
})
export class PrivacyModule {}
