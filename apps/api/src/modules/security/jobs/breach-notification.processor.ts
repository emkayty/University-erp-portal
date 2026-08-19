import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { PrismaService } from '../../../database/prisma.service';
import { OutboxService } from '../../../common/outbox/outbox.service';
import { QUEUE_NAMES } from '../../../common/queue-names';

interface NitdaNotificationJob { incidentId: string; deadline: string }

/**
 * BreachNotificationProcessor — the escalating half of spec §16.1's breach
 * workflow. Re-alerts the DPO/VC every 6h (see the `repeat` option set by the
 * OutboxService route for `security.breach_reminder_requested`) until a human
 * calls markNitdaNotified(), which removes this repeatable job. Escalates
 * tone as the T+72h deadline nears — this queue has no automated "success"
 * path, because there is no NITDA API to actually notify (see service doc).
 *
 * AUDIT-C1 FIX: this used to call
 * `notificationsQueue.add('send-notification', {...})` directly — the
 * wrong job name/shape for NotificationsProcessor (which only handles
 * 'deliver-domain-event' jobs produced by OutboxService's cron), so every
 * reminder was silently dropped. There's no natural enclosing business
 * transaction here (this runs off BullMQ's own `repeat` schedule, not a
 * direct service call), so we open a short-lived transaction purely to
 * satisfy OutboxService.write()'s atomicity contract — the write and its
 * own commit ARE the unit of work for this job.
 *
 * DLQ: this codebase's established convention (see
 * admissions-ops.processor.ts) is an @OnWorkerEvent('failed') hook rather
 * than a separate DLQ queue+processor per queue — followed here too, with
 * an added error-level escalation because a silently-failing breach
 * reminder is a regulatory risk, not just an ops annoyance.
 */
@Processor(QUEUE_NAMES.BREACH_NOTIFICATION, { concurrency: 2 })
export class BreachNotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(BreachNotificationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly outbox: OutboxService,
  ) { super(); }

  async process(job: Job<NitdaNotificationJob>): Promise<void> {
    const { incidentId, deadline } = job.data;
    const incident = await this.prisma.securityIncident.findUnique({ where: { id: incidentId } });

    if (!incident || incident.status === 'NITDA_NOTIFIED' || incident.status === 'RESOLVED') {
      this.logger.log(`Incident ${incidentId} already closed out — reminder is now a no-op`);
      return;
    }

    const hoursRemaining = (new Date(deadline).getTime() - Date.now()) / (60 * 60 * 1000);
    const urgent = hoursRemaining < 24;

    const recipientIds = await this.findDpoAndVcRecipients();

    await this.prisma.$transaction(async (tx) => {
      await this.outbox.write(tx, 'security.breach_reminder', {
        incidentId, recipientIds, urgent,
        hoursRemaining: Math.max(0, Math.round(hoursRemaining)),
        type: incident.type,
      });
    });

    if (hoursRemaining < 0) {
      this.logger.error(
        `Incident ${incidentId}: T+72h NITDA deadline PASSED with no markNitdaNotified() call. ` +
        `This is a compliance breach in itself — escalate immediately outside this system.`,
      );
    }
  }

  /** Duplicated from SecurityIncidentsService intentionally — this processor
   *  has no service-layer dependency on it, and the query is a 3-line read;
   *  not worth a shared-utility extraction for this alone. */
  private async findDpoAndVcRecipients(): Promise<string[]> {
    const candidates = await this.prisma.user.findMany({
      where: { roles: { some: { OR: [{ roleName: 'VC' }, { roleName: 'STAFF' }, { roleName: 'SUPPORT_STAFF' }] } } },
      include: { roles: true },
    });
    return candidates
      .filter((u) => u.roles.some((r) =>
        r.roleName === 'VC'
        || ((r.roleName === 'STAFF' || r.roleName === 'SUPPORT_STAFF') && ((r.staffScope as { scopes?: string[] } | null)?.scopes ?? []).includes('dpo')),
      ))
      .map((u) => u.id);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, err: Error): void {
    this.logger.error(
      `Breach reminder job ${job.id} failed after ${job.attemptsMade} attempts: ${err.message}. ` +
      `A failed breach reminder is a regulatory risk, not just an ops issue — check ` +
      `security_incidents manually until this queue is healthy again.`,
    );
  }
}
