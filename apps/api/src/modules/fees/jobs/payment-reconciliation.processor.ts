import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { ModuleRef } from '@nestjs/core';
import { Job, Queue } from 'bullmq';
import { PaymentStatus } from '@prisma/client';

import { PrismaService } from '../../../database/prisma.service';
import { QUEUE_NAMES } from '../../../common/queue-names';
import { PaymentsService } from '../payments.service';

const STUCK_THRESHOLD_HOURS = 24;

/**
 * PaymentReconciliationProcessor — sweeps Payment rows stuck in PENDING for
 * more than 24h and queues a status-check job for each.
 *
 * STUB: the actual provider status-check API calls (Remita getStatus /
 * Paystack /transaction/verify) are TODO pending live credentials. This
 * scaffolding gives the queue, cron trigger, and per-payment job shape so
 * the real API calls slot in without further structural changes.
 *
 * idx_payment_status_created (status, createdAt) makes the sweep query
 * index-only.
 */
@Processor(QUEUE_NAMES.PAYMENT_RECONCILIATION, { concurrency: 2 })
export class PaymentReconciliationProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentReconciliationProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    @InjectQueue(QUEUE_NAMES.PAYMENT_RECONCILIATION) private readonly queue: Queue,
  ) { super(); }

  @Cron('0 */6 * * *', { timeZone: 'Africa/Lagos' }) // every 6 hours
  async sweepStuckPayments(): Promise<void> {
    const threshold = new Date(Date.now() - STUCK_THRESHOLD_HOURS * 3600_000);

    const stuck = await this.prisma.payment.findMany({
      where:  { status: PaymentStatus.PENDING, createdAt: { lt: threshold } },
      select: { id: true, providerRef: true, provider: true },
      take:   200, // bound per sweep
    });

    if (stuck.length === 0) return;
    this.logger.log(`Reconciliation sweep: ${stuck.length} payment(s) PENDING > ${STUCK_THRESHOLD_HOURS}h`);

    for (const p of stuck) {
      await this.queue.add(
        'check-status',
        { paymentId: p.id, providerRef: p.providerRef, provider: p.provider },
        {
          // Stable per-payment identity prevents overlapping six-hour sweeps
          // from creating duplicate pending reconciliation jobs while still
          // allowing a later sweep after BullMQ removes a completed job.
          jobId: `payment-reconcile:${p.id}`,
          // Financial reconciliation is retried more aggressively than the
          // platform default, while every attempt remains idempotent.
          attempts: 6,
          backoff: { type: 'exponential', delay: 30_000 },
          removeOnComplete: 1000,
          removeOnFail: 500,
        },
      );
    }
  }

  async process(job: Job<{ paymentId: string; providerRef: string; provider: string }>): Promise<void> {
    const { paymentId, providerRef, provider } = job.data;
    // PaymentsService becomes request-scoped because it uses AuditService's
    // optional request metadata. Resolve a fresh no-request instance for each
    // worker job so this processor itself remains singleton and Nest can
    // register its cron schedule and BullMQ lifecycle listeners.
    const payments = await this.moduleRef.resolve(PaymentsService, undefined, { strict: false });
    const result = await payments.reconcilePendingPayment(paymentId);

    if (result.reconciled) {
      this.logger.log(`Reconciled ${provider} payment ${paymentId} (${providerRef})`);
      return;
    }

    // A pending, provider-declared non-success is not a worker failure. It is
    // expected to be revisited by the scheduled sweep. Configuration and
    // verification blocks remain visible to operators; network failures throw
    // and use the retry/backoff policy above.
    const reason = result.reason ?? 'UNVERIFIED';
    const level = reason.includes('DISABLED') || reason.includes('NOT_CONFIGURED') || reason.includes('MISMATCH') ? 'warn' : 'debug';
    this.logger[level](`Payment ${paymentId} remains pending: ${reason}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<{ paymentId: string; providerRef: string; provider: string }> | undefined, error: Error) {
    this.logger.error(
      `Payment reconciliation job ${job?.id ?? 'unknown'} failed for ${job?.data.paymentId ?? 'unknown'} ` +
      `(${job?.data.provider ?? 'unknown'} ${job?.data.providerRef ?? 'unknown'}) after ${job?.attemptsMade ?? 0} attempt(s): ${error.message}`,
    );
  }
}
