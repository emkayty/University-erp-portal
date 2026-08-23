import { Injectable, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AuditAction } from '@prisma/client';

import { AuditService } from '../common/audit/audit.service';
import { DeadLetterEvent, OutboxService } from '../common/outbox/outbox.service';
import { QUEUE_NAMES } from '../common/queue-names';

@Injectable()
export class ReliabilityService {
  constructor(
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
    @Optional() @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notificationsQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.ADMISSIONS_OPS) private readonly admissionsQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.INVOICE_GENERATION) private readonly invoiceQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.PAYMENT_RECONCILIATION) private readonly reconciliationQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.REPORT_GENERATION) private readonly reportQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.BREACH_NOTIFICATION) private readonly breachQueue?: Queue,
    @Optional() @InjectQueue(QUEUE_NAMES.ACADEMIC_PROGRESSION) private readonly academicProgressionQueue?: Queue,
  ) {}

  listDeadLetters(limit?: number): Promise<DeadLetterEvent[]> {
    return this.outbox.listDeadLetters(limit);
  }

  async replayDeadLetter(eventId: string, actorId: string) {
    const result = await this.outbox.replayDeadLetter(eventId);
    await this.audit.log(
      {
        action: AuditAction.UPDATE,
        targetTable: 'domain_events',
        targetId: eventId,
        newValues: { status: result.status, eventType: result.eventType },
        metadata: { operation: 'dead_letter_replay', workerDispatch: true },
      },
      actorId,
    );
    return result;
  }

  async queueHealth() {
    const queues = [
      [QUEUE_NAMES.NOTIFICATIONS, this.notificationsQueue],
      [QUEUE_NAMES.ADMISSIONS_OPS, this.admissionsQueue],
      [QUEUE_NAMES.INVOICE_GENERATION, this.invoiceQueue],
      [QUEUE_NAMES.PAYMENT_RECONCILIATION, this.reconciliationQueue],
      [QUEUE_NAMES.REPORT_GENERATION, this.reportQueue],
      [QUEUE_NAMES.BREACH_NOTIFICATION, this.breachQueue],
      [QUEUE_NAMES.ACADEMIC_PROGRESSION, this.academicProgressionQueue],
    ] as const;

    const snapshots = await Promise.all(queues.map(async ([name, queue]) => {
      if (!queue) return { name, status: 'not_registered' as const };
      const counts = await queue.getJobCounts('waiting', 'active', 'completed', 'failed', 'delayed', 'paused');
      return { name, status: 'up' as const, ...counts };
    }));

    return { generatedAt: new Date().toISOString(), queues: snapshots };
  }
}


