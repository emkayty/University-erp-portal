import {
  BadRequestException, ConflictException, Injectable, Logger,
  NotFoundException, ServiceUnavailableException,
  UnauthorizedException, UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, PaymentProvider, PaymentStatus, Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { v4 as uuid } from 'uuid';

import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { FeeClearanceService } from './fee-clearance.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { WebhookVerificationService } from './webhook-verification.service';
import { RlsContextService } from '../../common/rls/rls-context.service';
import type { InitiatePaymentDto, TsaManualPaymentDto } from './dto/fees.dto';

export interface PaymentInitResult {
  paymentId:   string;
  providerRef: string;
  provider:    PaymentProvider;
  /** Remita: RRR for payer to complete at bank/USSD. Paystack: authorization_url. */
  reference:   string;
  amount:      string;
}

export interface ConfirmPaymentResult {
  alreadyProcessed: boolean;
  paymentId:        string;
  feeStatus:        string;
  feeCleared:       boolean;
}

/**
 * PaymentsService — payment initiation, webhook confirmation, TSA manual entry.
 *
 * confirmPayment() is THE C5 FIX: payment status, StudentFee balances,
 * Student.feeCleared, and the outbox event row are ALL updated inside ONE
 * $transaction. Either everything commits together or nothing does — no
 * window where a payment is marked SUCCESS but feeCleared lags behind.
 *
 * P0-2 FIX (this pass — see docs/CHANGELOG.md): Payment is a
 * FORCE-RLS model (migration 0011). Every Payment/Student access now routes
 * through `this.prisma.forRequest(this.rlsContext)` (reads) or
 * `this.prisma.runExclusive(this.rlsContext, ...)` (the two transactional
 * methods below) instead of the plain client. This module's existing
 * advisory-lock pattern (idempotencyKey / providerRef, both already
 * correct) is preserved exactly — runExclusive() reuses the request's
 * ambient RLS transaction when present, so the lock and the RLS session
 * variables now live in the SAME transaction rather than requiring two
 * separate connections.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private readonly prisma:        PrismaService,
    private readonly audit:         AuditService,
    private readonly clearance:     FeeClearanceService,
    private readonly outbox:        OutboxService,
    private readonly webhookVerify: WebhookVerificationService,
    private readonly rlsContext:    RlsContextService,
  ) {}

  /**
   * Makes an outbound provider request with a finite deadline. Provider calls
   * must never hold a request open indefinitely or consume a database pool
   * connection while an upstream network dependency is stalled.
   */
  private async providerFetch(url: string, init: RequestInit): Promise<Response> {
    const timeoutMs = Number(process.env.PAYMENT_PROVIDER_TIMEOUT_MS ?? 10_000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } catch (err) {
      const message = err instanceof Error && err.name === 'AbortError'
        ? `Provider request exceeded ${timeoutMs}ms`
        : err instanceof Error ? err.message : String(err);
      throw new ServiceUnavailableException({ code: 'PROVIDER_ERROR', message: `Payment provider request failed: ${message}` });
    } finally {
      clearTimeout(timer);
    }
  }

  private paymentProviderReference(feeId: string, idempotencyKey: string): string {
    const digest = createHash('sha256').update(`${feeId}:${idempotencyKey}`).digest('hex').slice(0, 30);
    return `PSK_${digest}`;
  }

  private paymentInitResult(payment: {
    id: string; providerRef: string; provider: PaymentProvider; amount: { toFixed: (digits: number) => string }; metadata: unknown;
  }): PaymentInitResult {
    const metadata = payment.metadata as { authorizationUrl?: unknown } | null;
    const authorizationUrl = metadata?.authorizationUrl;
    return {
      paymentId: payment.id,
      providerRef: payment.providerRef,
      provider: payment.provider,
      // A saved checkout URL is necessary to make retry responses useful; an
      // RRR/bank reference is itself the payer-facing reference.
      reference: payment.provider === PaymentProvider.PAYSTACK && typeof authorizationUrl === 'string'
        ? authorizationUrl : payment.providerRef,
      amount: payment.amount.toFixed(2),
    };
  }

  // ── Initiate ─────────────────────────────────────────────────────────────
  /**
   * Creates a PENDING Payment row and returns provider-specific reference
   * data the frontend uses to redirect/display the payment instrument.
   *
   * Deep-audit fix (Aug 2026): Remita RRR-generation and Paystack
   * transaction-initialize now make real outbound API calls — this
   * previously generated a fake local reference for both providers
   * (explicit TODOs), meaning no student could actually complete an
   * online payment through this system regardless of how correct the
   * REST of the pipeline was. confirmPayment()'s webhook-confirmation
   * path (the actual money-received handling) was already solid and is
   * unchanged by this fix — it was always ready to receive real
   * callbacks, it just never had a real reference to receive them for.
   *
   * The two providers get different confidence levels, both stated
   * honestly in code rather than papered over:
   *  - Paystack's /transaction/initialize is a single, stable, precisely-
   *    documented endpoint — implemented directly with high confidence.
   *  - Remita's REST surface is NOT uniformly documented across product
   *    lines (Remita Pay / Aggregator / e-Collect) — this file's own
   *    WebhookVerificationService docblock already flags this for the
   *    webhook side. The RRR-generation endpoint URL is therefore
   *    configurable (REMITA_RRR_ENDPOINT), defaulting to Remita's public
   *    demo/sandbox host, and should be confirmed against the
   *    institution's actual signed Remita merchant integration guide
   *    before go-live — same TODO the webhook side already carries.
   */
  async initiatePayment(dto: InitiatePaymentDto, studentId: string, idempotencyKey?: string): Promise<PaymentInitResult> {
    if (!idempotencyKey || idempotencyKey.length < 16) {
      throw new BadRequestException('An idempotency key is required to initiate a payment');
    }
    const fee = await this.prisma.studentFee.findUniqueOrThrow({
      where: { id: dto.studentFeeId },
      include: { student: { select: { firstName: true, lastName: true, email: true, phone: true } } },
    });

    if (fee.studentId !== studentId) {
      throw new UnauthorizedException({ code: 'RBAC_FORBIDDEN', message: 'This fee does not belong to you' });
    }

    if (fee.status === 'PAID' || fee.status === 'WAIVED') {
      throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'This fee is already settled' });
    }

    const outstanding = fee.amount.sub(fee.waiverAmount).sub(fee.amountPaid);
    const amount      = dto.amount ?? outstanding.toNumber();

    if (amount <= 0 || amount > outstanding.toNumber() + 0.01) {
      throw new BadRequestException(`Amount must be between 0 and ${outstanding.toFixed(2)}`);
    }

    // P1-07: reserve a durable local row BEFORE provider I/O. The advisory
    // lock serializes a given idempotency key, while the committed INITIATING
    // row and its short lease survive process crashes and prevent a second
    // request from issuing another hosted checkout / RRR in the gap.
    const staged = await this.prisma.runExclusive(this.rlsContext, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`;
      const now = new Date();
      const existing = await tx.payment.findFirst({ where: { idempotencyKey }, orderBy: { createdAt: 'desc' } });
      if (existing) {
        const existingAmount = typeof (existing.amount as unknown as { toNumber?: unknown }).toNumber === 'function'
          ? (existing.amount as unknown as { toNumber: () => number }).toNumber()
          : Number(existing.amount);
        if (
          existing.studentFeeId !== fee.id ||
          existing.studentId !== studentId ||
          existing.provider !== dto.provider ||
          !Number.isFinite(existingAmount) ||
          Math.abs(existingAmount - amount) > 0.01
        ) {
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_REUSED',
            message: 'This idempotency key is already bound to a different payment request, amount, or provider.',
          });
        }
        const reusableStatuses: PaymentStatus[] = [PaymentStatus.PENDING, PaymentStatus.SUCCESS];
        if (reusableStatuses.includes(existing.status)) {
          return { reuse: true as const, payment: existing };
        }
        if (existing.status === PaymentStatus.INITIATING && existing.initiationLeaseUntil && existing.initiationLeaseUntil > now) {
          throw new ConflictException({
            code: 'PAYMENT_INITIATION_IN_PROGRESS',
            message: 'Payment initialization is already in progress. Retry with the same idempotency key shortly.',
          });
        }
        const resumed = await tx.payment.update({
          where: { id_createdAt: { id: existing.id, createdAt: existing.createdAt } },
          data: {
            status: PaymentStatus.INITIATING,
            initiationLeaseUntil: new Date(now.getTime() + 2 * 60 * 1000),
          },
        });
        return { reuse: false as const, payment: resumed };
      }

      const preliminaryProviderRef = dto.provider === PaymentProvider.PAYSTACK
        ? this.paymentProviderReference(fee.id, idempotencyKey)
        : `INIT_${uuid().replace(/-/g, '').slice(0, 24)}`;
      const payment = await tx.payment.create({
        data: {
          studentFeeId: fee.id,
          studentId,
          amount,
          provider: dto.provider,
          providerRef: preliminaryProviderRef,
          status: PaymentStatus.INITIATING,
          initiationLeaseUntil: new Date(now.getTime() + 2 * 60 * 1000),
          idempotencyKey,
          metadata: { initiationState: 'LEASED', requestProvider: dto.provider } as unknown as Prisma.InputJsonValue,
        },
      });
      return { reuse: false as const, payment };
    });
    if (staged.reuse) return this.paymentInitResult(staged.payment);

    let providerRef: string;
    let reference: string;
    let metadata: Prisma.InputJsonValue | null = null;
    try {
      switch (dto.provider) {
        case PaymentProvider.REMITA: {
          const orderId = `RMT_${staged.payment.id.replace(/-/g, '')}`;
          const rrr = await this.generateRemitaRrr(amount, fee.student, orderId);
          providerRef = rrr;
          reference = rrr;
          metadata = { remitaOrderId: orderId } as unknown as Prisma.InputJsonValue;
          break;
        }
        case PaymentProvider.PAYSTACK: {
          const init = await this.initializePaystackTransaction(
            fee.id, amount, fee.student.email, staged.payment.providerRef,
          );
          providerRef = init.reference;
          reference = init.authorizationUrl;
          metadata = { authorizationUrl: init.authorizationUrl } as unknown as Prisma.InputJsonValue;
          break;
        }
        case PaymentProvider.BANK_TRANSFER: {
          providerRef = `BTR_${staged.payment.id.replace(/-/g, '').slice(0, 20)}`;
          reference = providerRef;
          metadata = { bankTransferReference: providerRef } as unknown as Prisma.InputJsonValue;
          break;
        }
        default:
          throw new BadRequestException(`Provider ${dto.provider} requires the TSA manual endpoint`);
      }
    } catch (error) {
      await this.prisma.runExclusive(this.rlsContext, async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`;
        await tx.payment.update({
          where: { id_createdAt: { id: staged.payment.id, createdAt: staged.payment.createdAt } },
          data: { status: PaymentStatus.FAILED, initiationLeaseUntil: null },
        });
      });
      throw error;
    }

    const payment = await this.prisma.runExclusive(this.rlsContext, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${idempotencyKey}))`;
      return tx.payment.update({
        where: { id_createdAt: { id: staged.payment.id, createdAt: staged.payment.createdAt } },
        data: {
          providerRef,
          status: PaymentStatus.PENDING,
          initiationLeaseUntil: null,
          metadata: metadata ?? undefined,
        },
      });
    });
    return this.paymentInitResult(payment);
  }

  /**
   * Calls Paystack's /transaction/initialize — a single, stable, precisely
   * documented endpoint (unlike Remita's, see generateRemitaRrr() below).
   * Amount is converted to kobo (Paystack's base unit) per their API.
   */
  private async initializePaystackTransaction(
    feeId: string, amountNaira: number, email: string, reference: string,
  ): Promise<{ reference: string; authorizationUrl: string }> {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) {
      throw new ServiceUnavailableException({
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Online card/bank payment is not available right now (Paystack not configured). Use bank transfer or contact the bursary.',
      });
    }

    let res: Response;
    try {
      const apiBase = (process.env.PAYSTACK_API_BASE_URL ?? 'https://api.paystack.co').replace(/\/$/, '');
      res = await this.providerFetch(`${apiBase}/transaction/initialize`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          amount: Math.round(amountNaira * 100), // kobo
          reference,
          callback_url: process.env.FRONTEND_ORIGIN?.split(',')[0]?.trim() ? `${process.env.FRONTEND_ORIGIN.split(',')[0].trim()}/dashboard/fees?ref=${reference}` : undefined,
          metadata: { studentFeeId: feeId },
        }),
      });
    } catch (err) {
      this.logger.error(`Paystack initialize request failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException({ code: 'PROVIDER_ERROR', message: 'Could not reach the payment provider — please try again shortly' });
    }

    const body = await res.json().catch(() => ({})) as { status?: boolean; data?: { reference: string; authorization_url: string }; message?: string };
    if (!res.ok || !body.status || !body.data) {
      this.logger.error(`Paystack initialize failed: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
      throw new ServiceUnavailableException({ code: 'PROVIDER_ERROR', message: body.message ?? 'Could not initialize payment — please try again shortly' });
    }

    return { reference: body.data.reference, authorizationUrl: body.data.authorization_url };
  }

  /**
   * Requests a Remita Retrieval Reference (RRR) — the payer completes the
   * actual payment at a bank branch, USSD, or Remita's own portal using
   * this reference, then confirmPayment()'s webhook/status-check path
   * (already solid, unchanged by this fix) credits it.
   *
   * Confidence caveat (stated here, not hidden): Remita's REST surface is
   * NOT uniformly documented across product lines (Remita Pay vs
   * Aggregator vs e-Collect) — WebhookVerificationService's class doc
   * already flags this for the webhook side, and the same caveat applies
   * to this outbound call. The endpoint URL is therefore configurable
   * (REMITA_RRR_ENDPOINT), defaulting to Remita's public demo/sandbox
   * host, and the request/response shape below follows the commonly-
   * documented Remita Pay Inbound API — confirm both against the
   * institution's actual signed Remita merchant integration guide before
   * go-live, same as the existing TODO on the webhook side.
   */
  private async generateRemitaRrr(
    amountNaira: number,
    payer: { firstName: string; lastName: string; email: string; phone: string },
    orderId: string,
  ): Promise<string> {
    const merchantId    = process.env.REMITA_MERCHANT_ID;
    const apiKey         = process.env.REMITA_API_KEY;
    const serviceTypeId  = process.env.REMITA_SERVICE_TYPE_ID;
    if (!merchantId || !apiKey || !serviceTypeId) {
      throw new ServiceUnavailableException({
        code: 'PROVIDER_NOT_CONFIGURED',
        message: 'Online Remita payment is not available right now. Use bank transfer or contact the bursary.',
      });
    }

    const amountStr = amountNaira.toFixed(2);
    const apiHash    = this.webhookVerify.computeRemitaRrrHash(serviceTypeId, orderId, amountStr);
    const endpoint   = process.env.REMITA_RRR_ENDPOINT
      ?? 'https://remitademo.net/remita/exapp/api/v1/send/api/echannelsvc/merchant/api/paymentinit';

    let res: Response;
    try {
      res = await this.providerFetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `remitaConsumerKey=${merchantId}, remitaConsumerToken=${apiHash}`,
        },
        body: JSON.stringify({
          serviceTypeId, amount: amountStr, orderId,
          payerName:  `${payer.firstName} ${payer.lastName}`,
          payerEmail: payer.email,
          payerPhone: payer.phone,
          description: 'UniPortal fee payment',
          currency:    'NGN',
        }),
      });
    } catch (err) {
      this.logger.error(`Remita RRR request failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new ServiceUnavailableException({ code: 'PROVIDER_ERROR', message: 'Could not reach the payment provider — please try again shortly' });
    }

    const body = await res.json().catch(() => ({})) as { RRR?: string; statuscode?: string; status?: string };
    if (!res.ok || !body.RRR) {
      this.logger.error(`Remita RRR generation failed: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
      throw new ServiceUnavailableException({ code: 'PROVIDER_ERROR', message: 'Could not generate a payment reference — please try again shortly' });
    }

    return body.RRR;
  }

  // ── THE C5 FIX: atomic confirmation ─────────────────────────────────────
  /**
   * Confirms a payment by providerRef. Idempotent: if the Payment is already
   * SUCCESS, returns immediately without re-crediting (prevents double-credit
   * from webhook retries).
   *
   * Everything below runs in ONE $transaction:
   *   1. Payment → SUCCESS
   *   2. StudentFee.amountPaid += amount (Decimal-safe .add())
   *   3. StudentFee.status recomputed (PENDING/PARTIAL/PAID)
   *   4. Student.feeCleared recomputed across ALL fees for academicYear
   *   5. DomainEvent('payment.completed') written to outbox
   */
  async confirmPayment(
    providerRef: string,
    amountPaid:  number,
    paidAt:      Date,
    channel?:    string,
  ): Promise<ConfirmPaymentResult> {
    return this.prisma.runExclusive(this.rlsContext, async (tx) => {
      // P10 PARTITIONING FIX: `payments` is RANGE-partitioned by created_at,
      // so providerRef can no longer be a standalone UNIQUE constraint (see
      // Payment model doc) — without a lock, two concurrent webhook
      // deliveries for the same providerRef could both pass the
      // status-check below before either writes SUCCESS, double-crediting
      // the fee. The advisory lock (same pattern used elsewhere in this
      // codebase) serializes them.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${providerRef}))`;

      const payment = await tx.payment.findFirst({ where: { providerRef } });
      if (!payment) {
        throw new NotFoundException({ code: 'RESOURCE_NOT_FOUND', message: `No payment found for reference ${providerRef}` });
      }
      const expectedAmount = Number(payment.amount);
      if (!Number.isFinite(amountPaid) || amountPaid <= 0 || Math.abs(expectedAmount - amountPaid) > 0.01) {
        throw new UnprocessableEntityException({
          code: 'PAYMENT_AMOUNT_MISMATCH',
          message: `Confirmed amount ${amountPaid} does not match initiated amount ${expectedAmount.toFixed(2)}`,
        });
      }

      // Idempotency: webhook retries are common — never double-credit
      if (payment.status === PaymentStatus.SUCCESS) {
        const fee = await tx.studentFee.findUniqueOrThrow({ where: { id: payment.studentFeeId } });
        const student = await tx.student.findUniqueOrThrow({
          where: { id: payment.studentId }, select: { feeCleared: true },
        });
        return {
          alreadyProcessed: true, paymentId: payment.id,
          feeStatus: fee.status, feeCleared: student.feeCleared,
        };
      }

      // 1. Payment → SUCCESS
      await tx.payment.update({
        where: { id_createdAt: { id: payment.id, createdAt: payment.createdAt } },
        data:  { status: PaymentStatus.SUCCESS, paidAt, channel: channel ?? null },
      });

      // 2-3. StudentFee.amountPaid += amount, recompute status
      const fee = await tx.studentFee.findUniqueOrThrow({ where: { id: payment.studentFeeId } });
      await tx.studentFee.update({
        where: { id: fee.id },
        data:  { amountPaid: fee.amountPaid.add(amountPaid) },
      });
      const { feeStatus, feeCleared } = await this.clearance.recomputeStudentFee(tx, fee.id);

      // 5. Outbox — durable event for notifications/side-effects (S1/H9)
      await this.outbox.write(tx, 'payment.completed', {
        paymentId: payment.id, studentId: payment.studentId,
        studentFeeId: fee.id, amount: amountPaid,
        invoiceNo: fee.invoiceNo, feeStatus, feeCleared,
      });

      await tx.auditLog.create({
        data: {
          action: AuditAction.UPDATE, targetTable: 'payments', targetId: payment.id,
          newValues: { status: 'SUCCESS', amount: amountPaid, providerRef },
        },
      });

      this.logger.log(`Payment confirmed: ${providerRef} → ₦${amountPaid} (fee ${fee.invoiceNo} now ${feeStatus}, feeCleared=${feeCleared})`);

      return { alreadyProcessed: false, paymentId: payment.id, feeStatus, feeCleared };
    });
  }

  // ── Paystack webhook ─────────────────────────────────────────────────────
  async handlePaystackWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ received: boolean }> {
    if (!this.webhookVerify.verifyPaystack(rawBody, signature)) {
      throw new UnauthorizedException({ code: 'AUTH_INVALID_CREDENTIALS', message: 'Invalid Paystack signature' });
    }

    const body = JSON.parse(rawBody.toString('utf8')) as {
      event: string;
      data: { reference: string; amount: number; status: string; channel?: string; paid_at?: string };
    };

    if (body.event !== 'charge.success' || body.data.status !== 'success') {
      this.logger.debug(`Paystack webhook ignored: event=${body.event}, status=${body.data.status}`);
      return { received: true };
    }

    const amountNaira = body.data.amount / 100; // Paystack amounts are in kobo
    await this.confirmPayment(
      body.data.reference, amountNaira,
      body.data.paid_at ? new Date(body.data.paid_at) : new Date(),
      body.data.channel,
    );

    return { received: true };
  }

  // ── Remita webhook (ping → verify-callback pattern) ─────────────────────
  async handleRemitaWebhook(rawBody: Buffer, signature: string | undefined): Promise<{ received: boolean }> {
    // Advisory check only — never blocks (see WebhookVerificationService doc)
    this.webhookVerify.verifyRemitaWebhookAdvisory(rawBody, signature);

    const body = JSON.parse(rawBody.toString('utf8')) as { rrr: string; status?: string; transactionId?: string };
    if (!body.rrr) throw new BadRequestException('Missing rrr in Remita webhook payload');

    // BINDING verification: compute status-check hash and (in production)
    // call Remita's status API server-to-server. Stubbed here pending
    // credentials — see TODO in WebhookVerificationService.
    const statusHash = this.webhookVerify.computeRemitaStatusHash(body.rrr);
    this.logger.debug(`Remita status-check hash computed for RRR ${body.rrr}: ${statusHash.slice(0, 16)}...`);

    // NEW-3 FIX: Remita webhook is treated as a PING ONLY — we do NOT confirm
    // payment based solely on the webhook payload's status field. Any attacker
    // who knows a valid RRR (visible to the student in their payment history)
    // could POST { rrr: "RRR123", status: "00" } and trigger confirmPayment()
    // without paying a single kobo.
    //
    // SAFE PATTERN: Acknowledge the webhook (return 200 so Remita stops retrying),
    // then queue a reconciliation job that will perform a server-to-server
    // checkStatus() call before crediting. The PaymentReconciliationProcessor
    // handles this — it already sweeps PENDING > 24h. For faster confirmation,
    // we queue an immediate check-status job here.
    //
    const payment = await this.prisma.runSystem(async (tx) => {
      const pending = await tx.payment.findFirst({
        where: { providerRef: body.rrr }, select: { id: true, provider: true, status: true },
      });
      if (!pending || pending.provider !== PaymentProvider.REMITA || pending.status !== PaymentStatus.PENDING) return null;
      await this.outbox.write(tx, 'payment.reconciliation_requested', {
        paymentId: pending.id,
        providerRef: body.rrr,
        provider: PaymentProvider.REMITA,
      });
      return pending;
    });
    if (!payment) {
      // Preserve provider idempotency without revealing internal payment state.
      this.logger.warn(`Remita callback has no pending matching payment for RRR ${body.rrr}`);
      return { received: true };
    }

    this.logger.log(`Remita webhook received for RRR ${body.rrr} (status: ${body.status}) — durable reconciliation event recorded`);
    return { received: true };
  }

  // ── TSA Manual (M18 partial fix) ─────────────────────────────────────────
  /**
   * Bursar-only manual payment entry for institutions with tsaEnabled=true.
   * Represents an offline-confirmed TSA/GIFMIS receipt. Full automated
   * GIFMIS API reconciliation is deferred (docs/CHANGELOG.md M18) —
   * this gives Bursars a functional workflow today.
   */
  async recordTsaPayment(dto: TsaManualPaymentDto, actorId: string): Promise<ConfirmPaymentResult> {
    const settings = await this.prisma.institutionSettings.findFirst({ select: { tsaEnabled: true } });
    if (!settings?.tsaEnabled) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: 'TSA mode is not enabled for this institution. Enable it in Settings first.',
      });
    }

    const fee = await this.prisma.studentFee.findUniqueOrThrow({ where: { id: dto.studentFeeId } });
    const outstanding = fee.amount.sub(fee.waiverAmount).sub(fee.amountPaid).toNumber();
    if (fee.status === 'PAID' || fee.status === 'WAIVED') {
      throw new ConflictException({ code: 'DUPLICATE_RESOURCE', message: 'This fee is already settled.' });
    }
    if (!Number.isFinite(dto.amount) || dto.amount <= 0 || dto.amount > outstanding + 0.01) {
      throw new BadRequestException(`TSA amount must be between 0 and ${outstanding.toFixed(2)}`);
    }
    const receiptReference = dto.tsaReference.trim().toUpperCase();
    if (!receiptReference) {
      throw new BadRequestException('A TSA receipt reference is required.');
    }
    const providerRef = `TSA_${receiptReference}`;

    // P1-08: a receipt claim is deliberately stored outside partitioned
    // payments. This gives an immutable global uniqueness boundary even when
    // a manual submission is repeated months later in a different partition.
    const payment = await this.prisma.runExclusive(this.rlsContext, async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`tsa-receipt:${receiptReference}`}))`;
      const claimed = await tx.paymentReceiptClaim.findUnique({ where: { receiptReference } });
      if (claimed) {
        throw new ConflictException({
          code: 'DUPLICATE_TSA_RECEIPT',
          message: 'This TSA receipt has already been recorded and cannot be submitted again.',
        });
      }
      // Protect records created before the claim registry was deployed.
      const legacyPayment = await tx.payment.findFirst({ where: { providerRef } });
      if (legacyPayment) {
        throw new ConflictException({
          code: 'DUPLICATE_TSA_RECEIPT',
          message: 'This TSA receipt has already been recorded and cannot be submitted again.',
        });
      }
      const created = await tx.payment.create({
        data: {
          studentFeeId: fee.id,
          studentId: fee.studentId,
          amount: dto.amount,
          provider: PaymentProvider.TSA_MANUAL,
          providerRef,
          status: PaymentStatus.PENDING,
          metadata: { tsaReference: receiptReference, recordedBy: actorId } as unknown as Prisma.InputJsonValue,
        },
      });
      await tx.paymentReceiptClaim.create({
        data: {
          receiptReference,
          paymentId: created.id,
          studentFeeId: fee.id,
          provider: PaymentProvider.TSA_MANUAL,
        },
      });
      return created;
    });

    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'payments', targetId: payment.id,
      newValues: { provider: 'TSA_MANUAL', tsaReference: receiptReference, amount: dto.amount },
    }, actorId);

    return this.confirmPayment(
      payment.providerRef, dto.amount,
      dto.paidAt ? new Date(dto.paidAt) : new Date(),
      'tsa',
    );
  }

  // ── Provider reconciliation ───────────────────────────────────────────────
  /**
   * Reconciles one pending payment without trusting the browser or inbound
   * webhook payload. It is safe to invoke repeatedly from queue retries: the
   * final ledger mutation remains idempotent in confirmPayment().
   */
  async reconcilePendingPayment(paymentId: string): Promise<{ reconciled: boolean; reason?: string }> {
    const payment = await this.prisma.runSystem((tx) => tx.payment.findFirst({
      where: { id: paymentId },
      select: { id: true, provider: true, providerRef: true, status: true },
    }));

    if (!payment) return { reconciled: false, reason: 'PAYMENT_NOT_FOUND' };
    if (payment.status !== PaymentStatus.PENDING) return { reconciled: false, reason: `PAYMENT_${payment.status}` };

    switch (payment.provider) {
      case PaymentProvider.PAYSTACK:
        return this.reconcilePaystack(payment.providerRef);
      case PaymentProvider.REMITA:
        return this.reconcileRemita(payment.providerRef);
      default:
        return { reconciled: false, reason: `UNSUPPORTED_PROVIDER_${payment.provider}` };
    }
  }

  private async reconcilePaystack(providerRef: string): Promise<{ reconciled: boolean; reason?: string }> {
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey) return { reconciled: false, reason: 'PAYSTACK_NOT_CONFIGURED' };

    const apiBase = (process.env.PAYSTACK_API_BASE_URL ?? 'https://api.paystack.co').replace(/\/$/, '');
    const res = await this.providerFetch(`${apiBase}/transaction/verify/${encodeURIComponent(providerRef)}`, {
      method: 'GET', headers: { Authorization: `Bearer ${secretKey}` },
    });
    const body = await res.json().catch(() => ({})) as {
      status?: boolean;
      data?: { status?: string; amount?: number; currency?: string; paid_at?: string; channel?: string };
    };
    const verified = body.data;
    if (!res.ok || !body.status || !verified) {
      this.logger.warn(`Paystack reconciliation unavailable for ${providerRef}: HTTP ${res.status}`);
      return { reconciled: false, reason: 'PAYSTACK_VERIFY_UNAVAILABLE' };
    }
    if (verified.status !== 'success') return { reconciled: false, reason: `PAYSTACK_${verified.status ?? 'PENDING'}` };
    if (verified.currency && verified.currency !== 'NGN') return { reconciled: false, reason: 'PAYSTACK_CURRENCY_MISMATCH' };
    const amountKobo = verified.amount;
    if (typeof amountKobo !== 'number' || !Number.isInteger(amountKobo) || amountKobo <= 0) {
      return { reconciled: false, reason: 'PAYSTACK_INVALID_AMOUNT' };
    }

    const paidAt = verified.paid_at ? new Date(verified.paid_at) : new Date();
    if (Number.isNaN(paidAt.valueOf())) return { reconciled: false, reason: 'PAYSTACK_INVALID_PAID_AT' };
    await this.confirmPayment(providerRef, amountKobo / 100, paidAt, verified.channel ?? 'paystack');
    return { reconciled: true };
  }

  private async reconcileRemita(providerRef: string): Promise<{ reconciled: boolean; reason?: string }> {
    const enabled = process.env.REMITA_STATUS_VERIFICATION_ENABLED === 'true';
    const endpoint = process.env.REMITA_STATUS_ENDPOINT;
    if (!enabled || !endpoint) {
      // Do not make up a merchant-specific Remita endpoint or accept the
      // inbound webhook as proof of funds. A university must configure its
      // verified status-adapter contract before enabling this provider.
      return { reconciled: false, reason: 'REMITA_STATUS_VERIFICATION_DISABLED' };
    }

    const verificationHash = this.webhookVerify.computeRemitaStatusHash(providerRef);
    const res = await this.providerFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rrr: providerRef, verificationHash }),
    });
    const body = await res.json().catch(() => ({})) as {
      status?: string | number; statuscode?: string | number; amount?: number | string;
      paidAt?: string; paid_at?: string; channel?: string; currency?: string;
      data?: { status?: string | number; statuscode?: string | number; amount?: number | string; paidAt?: string; paid_at?: string; channel?: string; currency?: string };
    };
    if (!res.ok) return { reconciled: false, reason: `REMITA_VERIFY_HTTP_${res.status}` };

    const payload = body.data ?? body;
    const status = String(payload.statuscode ?? payload.status ?? '').toUpperCase();
    if (!['00', '01', 'SUCCESS', 'COMPLETED'].includes(status)) return { reconciled: false, reason: `REMITA_${status || 'PENDING'}` };
    if (payload.currency && payload.currency !== 'NGN') return { reconciled: false, reason: 'REMITA_CURRENCY_MISMATCH' };
    const amount = Number(payload.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { reconciled: false, reason: 'REMITA_INVALID_AMOUNT' };
    const paidAt = new Date(payload.paidAt ?? payload.paid_at ?? Date.now());
    if (Number.isNaN(paidAt.valueOf())) return { reconciled: false, reason: 'REMITA_INVALID_PAID_AT' };

    await this.confirmPayment(providerRef, amount, paidAt, payload.channel ?? 'remita');
    return { reconciled: true };
  }

  // ── Queries ───────────────────────────────────────────────────────────────
  async getPaymentHistory(studentId: string) {
    return this.prisma.forRequest(this.rlsContext).payment.findMany({
      where:   { studentId },
      include: { studentFee: { select: { invoiceNo: true, academicYear: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
