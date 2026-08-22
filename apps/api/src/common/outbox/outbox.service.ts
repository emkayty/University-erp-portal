import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';

import { PrismaService } from '../../database/prisma.service';
import { QUEUE_NAMES } from '../queue-names';

const BATCH_SIZE   = 50;
const MAX_ATTEMPTS = 10;

interface RawDomainEvent {
  id: string; event_type: string; payload: unknown;
  created_at: Date; processed_at: Date | null;
  dead_lettered_at: Date | null; next_attempt_at: Date | null;
  attempts: number; last_error: string | null;
}

export interface DeadLetterEvent {
  id: string;
  eventType: string;
  payload: unknown;
  createdAt: Date;
  deadLetteredAt: Date | null;
  attempts: number;
  lastError: string | null;
}

/**
 * OutboxService — Transactional Outbox (S1 / H9 / NEW-1 / H2 fixes).
 *
 * P10 NOTE: moved from modules/fees/ to common/outbox/. It was already being
 * cross-imported by results.module.ts (and, before this fix, would have
 * been by calendar/students/admissions/security too) directly from the fees
 * module's internals — each importer re-declared it as its own provider,
 * meaning multiple independent instances each running their own
 * `@Cron('*​/5 * * * * *')` poll of the SAME domain_events table. SKIP LOCKED
 * meant no row was ever double-processed, but it's wasteful and was a sign
 * this belonged in common/, not owned by one domain module. Now provided
 * once via OutboxModule and imported by every producer.
 *
 * H2 FIX: Replaced this.emitter.emit() with BullMQ job enqueue.
 *
 * WHY THE CHANGE: emitter.emit() is synchronous — it schedules async
 * listeners but does NOT await them. The outbox marked processed_at = NOW()
 * before any async work (email, LMS sync) completed. A process crash between
 * emit() and listener completion silently dropped the side effect permanently.
 *
 * BullMQ APPROACH: Each domain event is converted to a deterministic BullMQ job
 * after the event row is committed. PostgreSQL and Redis are independent systems,
 * so enqueue and processed_at are NOT one atomic transaction. The dispatcher
 * therefore keeps the event unprocessed until enqueue succeeds and uses a stable
 * domain-event job ID to suppress duplicate queue jobs where Redis retains them.
 * BullMQ owns retries independently via its own job queue with exponential
 * backoff. Downstream workers must remain idempotent because delivery is at-least-once.
 *
 * DELIVERY GUARANTEE: At-least-once via PostgreSQL DomainEvent + BullMQ.
 *   write()         → DomainEvent row committed inside business transaction
 *   processOutbox() → Routes to a deterministic BullMQ job; marks processed_at after enqueue
 *   BullMQ worker   → Delivers to downstream with retries and worker-specific idempotency
 *
 * SELECT FOR UPDATE SKIP LOCKED (NEW-1): Multiple processes (API + worker)
 * can poll simultaneously without processing the same event twice.
 */
@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    private readonly prisma:  PrismaService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATIONS) private readonly notifQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ADMISSIONS_OPS) private readonly admissionsQueue: Queue,
    @InjectQueue(QUEUE_NAMES.INVOICE_GENERATION) private readonly invoiceQueue: Queue,
    @InjectQueue(QUEUE_NAMES.PAYMENT_RECONCILIATION) private readonly reconciliationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.REPORT_GENERATION) private readonly reportQueue: Queue,
    @InjectQueue(QUEUE_NAMES.BREACH_NOTIFICATION) private readonly breachQueue: Queue,
    @InjectQueue(QUEUE_NAMES.ACADEMIC_PROGRESSION) private readonly academicProgressionQueue: Queue,
  ) {}

  /** Write inside the caller's $transaction — never call with this.prisma directly. */
  async write(
    tx:        Prisma.TransactionClient,
    eventType: string,
    payload:   Record<string, unknown>,
  ): Promise<string> {
    const event = await tx.domainEvent.create({
      data: { eventType, payload: payload as Prisma.InputJsonValue },
      select: { id: true },
    });
    return event.id;
  }

  /**
   * Returns a bounded operator view of dead-lettered events. Reads use the
   * trusted system transaction because this endpoint is an administrative
   * reliability operation, not an end-user domain query.
   */
  async listDeadLetters(limit = 50): Promise<DeadLetterEvent[]> {
    const boundedLimit = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100);
    return this.prisma.runSystem(async (tx) => {
      const rows = await tx.$queryRaw<RawDomainEvent[]>`
        SELECT id, "eventType" AS event_type, payload, "createdAt" AS created_at,
               "processedAt" AS processed_at, "deadLetteredAt" AS dead_lettered_at,
               "nextAttemptAt" AS next_attempt_at, attempts, "lastError" AS last_error
        FROM domain_events
        WHERE "deadLetteredAt" IS NOT NULL AND "processedAt" IS NULL
        ORDER BY "deadLetteredAt" DESC
        LIMIT ${Prisma.raw(String(boundedLimit))}
      `;
      return rows.map((row) => ({
        id: row.id,
        eventType: row.event_type,
        payload: row.payload,
        createdAt: row.created_at,
        deadLetteredAt: row.dead_lettered_at,
        attempts: row.attempts,
        lastError: row.last_error,
      }));
    });
  }

  /**
   * Atomically makes one dead-letter eligible for the normal worker-owned
   * dispatcher again. It does not enqueue directly from the HTTP process;
   * the worker scheduler remains the sole outbox poller and BullMQ owner.
   */
  async replayDeadLetter(eventId: string): Promise<{ id: string; eventType: string; status: 'QUEUED_FOR_REPLAY' }> {
    return this.prisma.runSystem(async (tx) => {
      const rows = await tx.$queryRaw<RawDomainEvent[]>`
        SELECT id, "eventType" AS event_type, payload, "createdAt" AS created_at,
               "processedAt" AS processed_at, "deadLetteredAt" AS dead_lettered_at,
               "nextAttemptAt" AS next_attempt_at, attempts, "lastError" AS last_error
        FROM domain_events
        WHERE id = ${eventId}::uuid
        FOR UPDATE
      `;
      const event = rows[0];
      if (!event) throw new NotFoundException('Dead-letter event not found');
      if (event.processed_at) throw new ConflictException('Processed events cannot be replayed');
      if (!event.dead_lettered_at) throw new ConflictException('Only dead-lettered events can be replayed');

      await tx.$executeRaw`
        UPDATE domain_events
        SET attempts = 0,
            "lastError" = NULL,
            "nextAttemptAt" = NOW(),
            "deadLetteredAt" = NULL
        WHERE id = ${eventId}::uuid
      `;

      return { id: event.id, eventType: event.event_type, status: 'QUEUED_FOR_REPLAY' as const };
    });
  }

  /** Called only by the worker-owned OutboxDispatchScheduler. */
  async processOutbox(): Promise<void> {
    await this.prisma.runSystem(async (tx) => {
      const events = await tx.$queryRaw<RawDomainEvent[]>`
        SELECT id, "eventType" AS event_type, payload, "createdAt" AS created_at,
               "processedAt" AS processed_at, "deadLetteredAt" AS dead_lettered_at,
               "nextAttemptAt" AS next_attempt_at, attempts, "lastError" AS last_error
        FROM domain_events
        WHERE "processedAt" IS NULL
          AND "deadLetteredAt" IS NULL
          AND attempts < ${MAX_ATTEMPTS}
          AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= NOW())
        ORDER BY "createdAt" ASC
        LIMIT ${Prisma.raw(String(BATCH_SIZE))}
        FOR UPDATE SKIP LOCKED
      `;

      if (events.length === 0) return;

      for (const event of events) {
        try {
          const route = this.routeEvent(event.event_type, event.payload as Record<string, unknown>);
          const jobData = route.forwardPayload
            ? { ...(event.payload as Record<string, unknown>), eventType: event.event_type, domainEventId: event.id }
            : { eventType: event.event_type, payload: event.payload, domainEventId: event.id };
          await route.queue.add(
            route.jobName,
            jobData,
            {
              jobId: route.jobId ?? `domain-event:${event.id}`,
              attempts: route.attempts ?? 5,
              backoff: { type: 'exponential', delay: 10_000 },
              ...(route.repeat ? { repeat: route.repeat, removeOnComplete: false } : {}),
            },
          );

          await tx.$executeRaw`
            UPDATE domain_events SET "processedAt" = NOW() WHERE id = ${event.id}::uuid
          `;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          this.logger.error(`Outbox enqueue failed for ${event.id} (${event.event_type}): ${message}`);
          const nextAttempt = new Date(Date.now() + Math.min(60 * 60 * 1000, 10_000 * (2 ** Math.min(event.attempts, 6))));
          await tx.$executeRaw`
            UPDATE domain_events
            SET attempts = attempts + 1,
                "lastError" = ${message.slice(0, 2000)},
                "nextAttemptAt" = CASE WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN NULL ELSE ${nextAttempt} END,
                "deadLetteredAt" = CASE WHEN attempts + 1 >= ${MAX_ATTEMPTS} THEN NOW() ELSE NULL END
            WHERE id = ${event.id}::uuid
          `;
          if (event.attempts + 1 >= MAX_ATTEMPTS) {
            this.logger.error(`Outbox event dead-lettered after ${MAX_ATTEMPTS} attempts: ${event.id} (${event.event_type})`);
          }
        }
      }

      this.logger.debug(`Outbox: enqueued ${events.length} event(s)`);
    }, { maxWait: 10_000, timeout: 30_000 });
  }

  private routeEvent(eventType: string, payload: Record<string, unknown>): { queue: Queue; jobName: string; attempts?: number; repeat?: { every: number }; jobId?: string; forwardPayload?: boolean } {
    switch (eventType) {
      case 'admissions.jamb_verification_requested':
        return { queue: this.admissionsQueue, jobName: 'verify-jamb', attempts: 3, forwardPayload: true };
      case 'admissions.manual_verification_required':
        return { queue: this.admissionsQueue, jobName: 'manual-verification-required', attempts: 3, forwardPayload: true };
      case 'fees.invoice_generation_requested':
        return { queue: this.invoiceQueue, jobName: 'generate-invoices', attempts: 3, forwardPayload: true };
      case 'payment.reconciliation_requested':
        return { queue: this.reconciliationQueue, jobName: 'check-status', attempts: 5, forwardPayload: true };
      case 'report.generate_requested':
        return { queue: this.reportQueue, jobName: 'generate-report', attempts: 5, forwardPayload: true };
      case 'privacy.sar_export_requested':
        return { queue: this.reportQueue, jobName: 'ndpr-sar-export', attempts: 5, forwardPayload: true };
      case 'privacy.portability_export_requested':
        return { queue: this.reportQueue, jobName: 'ndpr-portability-export', attempts: 5, forwardPayload: true };
      case 'academic.progression.refresh_requested':
        return {
          queue: this.academicProgressionQueue,
          jobName: 'refresh-progression',
          attempts: 5,
          jobId: typeof payload.studentId === 'string' && typeof payload.semesterId === 'string' && typeof payload.resultId === 'string'
            ? `academic-refresh:${payload.studentId}:${payload.semesterId}:${payload.resultId}`
            : undefined,
          forwardPayload: true,
        };
      case 'security.breach_reminder_requested':
        return {
          queue: this.breachQueue,
          jobName: 'nitda-notification',
          attempts: 5,
          repeat: { every: 6 * 60 * 60 * 1000 },
          jobId: typeof payload.incidentId === 'string' ? `breach-${payload.incidentId}` : undefined,
          forwardPayload: true,
        };
      default:
        return { queue: this.notifQueue, jobName: 'deliver-domain-event', attempts: 5 };
    }
  }
}
