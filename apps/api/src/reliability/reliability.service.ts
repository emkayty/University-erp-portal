import { Injectable } from '@nestjs/common';
import { AuditAction } from '@prisma/client';

import { AuditService } from '../common/audit/audit.service';
import { DeadLetterEvent, OutboxService } from '../common/outbox/outbox.service';

@Injectable()
export class ReliabilityService {
  constructor(
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
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
}


