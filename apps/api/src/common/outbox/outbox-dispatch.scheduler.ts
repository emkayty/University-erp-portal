import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { OutboxService } from './outbox.service';

/**
 * Worker-only schedule owner for durable domain-event dispatch. Keeping this
 * separate from OutboxService lets HTTP API processes produce events without
 * running a duplicate poller.
 */
@Injectable()
export class OutboxDispatchScheduler {
  constructor(private readonly outbox: OutboxService) {}

  @Cron('*/5 * * * * *')
  async dispatchPendingEvents(): Promise<void> {
    await this.outbox.processOutbox();
  }
}
