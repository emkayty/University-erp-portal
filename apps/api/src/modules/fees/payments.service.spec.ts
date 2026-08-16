import {
  BadRequestException, ConflictException, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { FeeStatus, PaymentProvider, PaymentStatus } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { QUEUE_NAMES } from '../../common/queue-names';
import { PrismaService } from '../../database/prisma.service';
import { RlsContextService } from '../../common/rls/rls-context.service';
import { FeeClearanceService } from './fee-clearance.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { PaymentsService } from './payments.service';
import { WebhookVerificationService } from './webhook-verification.service';

// ── Decimal-like helper (mimics Prisma Decimal API used in services) ─────────
class FakeDecimal {
  constructor(public value: number) {}
  // P0-15 FIX (this pass — see docs/CHANGELOG.md): same latent bug
  // pattern found and fixed in fees.service.spec.ts's FakeDecimal — add()
  // didn't unwrap a FakeDecimal argument the way sub()/gte() already do.
  // Not currently triggered here (the one real call site,
  // fee.amountPaid.add(amountPaid), passes a plain number), but left
  // inconsistent with its own sibling methods, it's a landmine for the
  // next test or code change that passes a Decimal-like object instead.
  add(n: FakeDecimal | number)  { return new FakeDecimal(this.value + (n instanceof FakeDecimal ? n.value : n)); }
  sub(n: FakeDecimal | number) { return new FakeDecimal(this.value - (n instanceof FakeDecimal ? n.value : n)); }
  gte(n: FakeDecimal | number) { return this.value >= (n instanceof FakeDecimal ? n.value : n); }
  gt(n: number)   { return this.value > n; }
  toNumber()      { return this.value; }
  toFixed(d: number) { return this.value.toFixed(d); }
}

const makePayment = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'pay-1', studentFeeId: 'fee-1', studentId: 'stu-1',
  amount: new FakeDecimal(25000), provider: PaymentProvider.PAYSTACK,
  providerRef: 'PSK_ref123', status: PaymentStatus.PENDING,
  paidAt: null, channel: null, metadata: null, idempotencyKey: null,
  createdAt: new Date(), updatedAt: new Date(), ...o,
});

const makeFee = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'fee-1', studentId: 'stu-1', feeScheduleId: 'sched-1',
  academicYear: '2025/2026', invoiceNo: 'INV-20252026-TUI-stu1-001',
  amount: new FakeDecimal(75000), amountPaid: new FakeDecimal(0),
  waiverAmount: new FakeDecimal(0), status: FeeStatus.PENDING,
  dueDate: null, student: { email: 'student@uniportal.test' }, createdAt: new Date(), updatedAt: new Date(), ...o,
});

describe('PaymentsService', () => {
  let svc:    PaymentsService;
  let prisma: Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock; forRequest: jest.Mock; runExclusive: jest.Mock; runSystem: jest.Mock };
  let audit:  jest.Mocked<AuditService>;
  let outbox: jest.Mocked<OutboxService>;

  let txMock: Record<string, Record<string, jest.Mock>> & { $executeRaw: jest.Mock };

  beforeEach(async () => {
    txMock = {
      // P10: findUnique → findFirst (providerRef/idempotencyKey are no longer
      // DB-unique post-partitioning — see Payment model doc). $executeRaw is
      // the advisory-lock call that now guards idempotency instead.
      payment:     { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
      paymentReceiptClaim: { findUnique: jest.fn(), create: jest.fn() },
      studentFee:  { findUniqueOrThrow: jest.fn(), update: jest.fn(), count: jest.fn() },
      student:     { findUniqueOrThrow: jest.fn(), update: jest.fn() },
      // P0-12 FIX (this pass — see docs/CHANGELOG.md): missing from
      // this mock even though FeeClearanceService.recomputeStudentClearance()
      // — called by confirmPayment() inside the SAME transaction — reads
      // tx.clearanceItem.findFirst(...) unconditionally (AUDIT-H3). Every
      // confirmPayment()-driven test threw "Cannot read properties of
      // undefined (reading 'findFirst')" before this fix, regardless of
      // environment. mockResolvedValue(null) matches the real method's own
      // graceful-absence handling (an institution that hasn't seeded "Fees
      // Clearance" simply skips that part of the update) and keeps every
      // pre-existing assertion in this file — none of which test the
      // clearance-item side-effect itself — unaffected.
      clearanceItem: { findFirst: jest.fn().mockResolvedValue(null) },
      studentClearance: { upsert: jest.fn() },
      auditLog:    { create: jest.fn() },
      domainEvent: { create: jest.fn() },
      $executeRaw: jest.fn().mockResolvedValue(undefined),
    } as never;

    prisma = {
      payment:    { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(makePayment({ providerRef: 'RRR123456789', provider: PaymentProvider.REMITA })), create: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      studentFee: { findUniqueOrThrow: jest.fn() },
      institutionSettings: { findFirst: jest.fn().mockResolvedValue({ tsaEnabled: true }) },
      $transaction: jest.fn((fn: (tx: typeof txMock) => unknown) => fn(txMock)),
      // P0-2 FIX (this pass — see docs/CHANGELOG.md): PaymentsService
      // now calls forRequest()/runExclusive() instead of touching the client
      // or $transaction directly (Payment is a FORCE-RLS model as of
      // migration 0011). forRequest() returning `prisma` itself reproduces
      // the "no active RLS transaction" fallback branch of the real
      // PrismaService.forRequest() — the branch every test in this file
      // already assumes, since none of them set up an ambient
      // RlsContextService context — so every prisma.payment.* /
      // prisma.studentFee.* assertion below stays valid unchanged.
      forRequest:   jest.fn().mockImplementation(() => prisma),
      runExclusive: jest.fn((_rlsContext: unknown, fn: (tx: typeof txMock) => unknown) => fn(txMock)),
      runSystem: jest.fn((fn: (tx: { payment: { findFirst: jest.Mock } }) => unknown) => fn({ payment: { findFirst: prisma.payment.findFirst } })),
    } as never;

    audit  = { log: jest.fn() } as unknown as jest.Mocked<AuditService>;
    outbox = { write: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<OutboxService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        FeeClearanceService,
        WebhookVerificationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService,  useValue: audit },
        { provide: OutboxService, useValue: outbox },
        { provide: getQueueToken(QUEUE_NAMES.PAYMENT_RECONCILIATION), useValue: { add: jest.fn().mockResolvedValue(undefined) } },
        { provide: RlsContextService, useValue: {} }, // opaque — only ever passed through to the mocked forRequest/runExclusive above
        { provide: ConfigService, useValue: { get: (key: string, def?: unknown) =>
          ({ PAYSTACK_SECRET_KEY: 'sk_test_12345', REMITA_API_KEY: 'remita_key', REMITA_MERCHANT_ID: 'merchant_1' } as Record<string,string>)[key] ?? def } },
      ],
    }).compile();

    svc = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ════════════════════ C5: ATOMIC FEE CLEARANCE ═══════════════════════════════
  describe('confirmPayment() — C5 atomicity', () => {
    it('marks fee PAID and feeCleared=true when payment covers full amount (single fee for the year)', async () => {
      txMock.payment.findFirst.mockResolvedValue(makePayment());
      txMock.studentFee.findUniqueOrThrow
        .mockResolvedValueOnce(makeFee())                                       // in confirmPayment
        .mockResolvedValueOnce(makeFee({ amountPaid: new FakeDecimal(75000) })); // in recomputeStudentFee
      txMock.studentFee.update.mockResolvedValue({});
      txMock.studentFee.count.mockResolvedValue(0); // no outstanding fees left
      txMock.student.findUniqueOrThrow.mockResolvedValue({ feeCleared: false });
      txMock.student.update.mockResolvedValue({});

      const result = await svc.confirmPayment('PSK_ref123', 75000, new Date(), 'card');

      expect(result.alreadyProcessed).toBe(false);
      expect(result.feeStatus).toBe(FeeStatus.PAID);
      expect(result.feeCleared).toBe(true);
      expect(txMock.payment.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: PaymentStatus.SUCCESS }),
      }));
      expect(txMock.student.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { feeCleared: true },
      }));
    });

    it('writes a DomainEvent (outbox) row in the SAME transaction (S1/H9)', async () => {
      txMock.payment.findFirst.mockResolvedValue(makePayment());
      txMock.studentFee.findUniqueOrThrow
        .mockResolvedValueOnce(makeFee())
        .mockResolvedValueOnce(makeFee({ amountPaid: new FakeDecimal(75000) }));
      txMock.studentFee.count.mockResolvedValue(0);
      txMock.student.findUniqueOrThrow.mockResolvedValue({ feeCleared: false });

      await svc.confirmPayment('PSK_ref123', 75000, new Date());

      expect(outbox.write).toHaveBeenCalledWith(
        txMock, 'payment.completed',
        expect.objectContaining({ paymentId: 'pay-1', studentFeeId: 'fee-1', amount: 75000 }),
      );
    });

    it('marks fee PARTIAL (not PAID) when payment is less than the full amount', async () => {
      txMock.payment.findFirst.mockResolvedValue(makePayment({ amount: new FakeDecimal(30000) }));
      txMock.studentFee.findUniqueOrThrow
        .mockResolvedValueOnce(makeFee())
        .mockResolvedValueOnce(makeFee({ amountPaid: new FakeDecimal(30000) }));
      txMock.studentFee.count.mockResolvedValue(1); // still outstanding
      txMock.student.findUniqueOrThrow.mockResolvedValue({ feeCleared: false });

      const result = await svc.confirmPayment('PSK_ref123', 30000, new Date());

      expect(result.feeStatus).toBe(FeeStatus.PARTIAL);
      expect(result.feeCleared).toBe(false);
      expect(txMock.student.update).not.toHaveBeenCalled(); // feeCleared unchanged → no write
    });

    it('does NOT set feeCleared=true if OTHER fees for the same year are still outstanding', async () => {
      txMock.payment.findFirst.mockResolvedValue(makePayment());
      txMock.studentFee.findUniqueOrThrow
        .mockResolvedValueOnce(makeFee())
        .mockResolvedValueOnce(makeFee({ amountPaid: new FakeDecimal(75000) }));
      // This fee is now PAID, but another fee for the same academicYear is PENDING
      txMock.studentFee.count.mockResolvedValue(1);
      txMock.student.findUniqueOrThrow.mockResolvedValue({ feeCleared: false });

      const result = await svc.confirmPayment('PSK_ref123', 75000, new Date());

      expect(result.feeStatus).toBe(FeeStatus.PAID);   // THIS fee is paid
      expect(result.feeCleared).toBe(false);           // but student overall is not cleared
      expect(txMock.student.update).not.toHaveBeenCalled();
    });
  });

  // ════════════════════ IDEMPOTENCY: NO DOUBLE-CREDIT ═══════════════════════════
  describe('confirmPayment() — idempotency', () => {
    it('returns alreadyProcessed=true and does NOT re-credit if Payment is already SUCCESS', async () => {
      txMock.payment.findFirst.mockResolvedValue(makePayment({ status: PaymentStatus.SUCCESS }));
      txMock.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee({ status: FeeStatus.PAID, amountPaid: new FakeDecimal(75000) }));
      txMock.student.findUniqueOrThrow.mockResolvedValue({ feeCleared: true });

      const result = await svc.confirmPayment('PSK_ref123', 75000, new Date());

      expect(result.alreadyProcessed).toBe(true);
      expect(result.feeCleared).toBe(true);
      expect(txMock.payment.update).not.toHaveBeenCalled();
      expect(txMock.studentFee.update).not.toHaveBeenCalled();
      expect(outbox.write).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for unknown providerRef', async () => {
      txMock.payment.findFirst.mockResolvedValue(null);
      await expect(svc.confirmPayment('UNKNOWN_REF', 1000, new Date()))
        .rejects.toThrow(NotFoundException);
    });
  });

  // ════════════════════ C6: PAYSTACK HMAC VERIFICATION ═══════════════════════════
  describe('handlePaystackWebhook() — C6 HMAC', () => {
    const SECRET = 'sk_test_12345';

    function signedBody(payload: Record<string, unknown>) {
      const raw = Buffer.from(JSON.stringify(payload));
      const sig = createHmac('sha512', SECRET).update(raw).digest('hex');
      return { raw, sig };
    }

    it('accepts a webhook with a VALID signature and credits the payment', async () => {
      const payload = { event: 'charge.success', data: { reference: 'PSK_ref123', amount: 7500000, status: 'success', channel: 'card', paid_at: new Date().toISOString() } };
      const { raw, sig } = signedBody(payload);

      txMock.payment.findFirst.mockResolvedValue(makePayment());
      txMock.studentFee.findUniqueOrThrow
        .mockResolvedValueOnce(makeFee())
        .mockResolvedValueOnce(makeFee({ amountPaid: new FakeDecimal(75000) }));
      txMock.studentFee.count.mockResolvedValue(0);
      txMock.student.findUniqueOrThrow.mockResolvedValue({ feeCleared: false });

      const result = await svc.handlePaystackWebhook(raw, sig);

      expect(result.received).toBe(true);
      expect(txMock.payment.update).toHaveBeenCalled(); // payment was credited
    });

    it('REJECTS a webhook with an INVALID signature — throws UnauthorizedException', async () => {
      const payload = { event: 'charge.success', data: { reference: 'PSK_ref123', amount: 7500000, status: 'success' } };
      const raw = Buffer.from(JSON.stringify(payload));

      await expect(svc.handlePaystackWebhook(raw, 'totally-wrong-signature'))
        .rejects.toThrow(UnauthorizedException);
      expect(txMock.payment.update).not.toHaveBeenCalled();
    });

    it('REJECTS a webhook with NO signature header', async () => {
      const payload = { event: 'charge.success', data: { reference: 'PSK_ref123', amount: 7500000, status: 'success' } };
      const raw = Buffer.from(JSON.stringify(payload));

      await expect(svc.handlePaystackWebhook(raw, undefined))
        .rejects.toThrow(UnauthorizedException);
    });

    it('converts amount from kobo to naira (divides by 100)', async () => {
      const payload = { event: 'charge.success', data: { reference: 'PSK_ref123', amount: 7500000, status: 'success' } };
      const { raw, sig } = signedBody(payload);

      txMock.payment.findFirst.mockResolvedValue(makePayment());
      txMock.studentFee.findUniqueOrThrow
        .mockResolvedValueOnce(makeFee())
        .mockResolvedValueOnce(makeFee({ amountPaid: new FakeDecimal(75000) }));
      txMock.studentFee.count.mockResolvedValue(0);
      txMock.student.findUniqueOrThrow.mockResolvedValue({ feeCleared: false });

      await svc.handlePaystackWebhook(raw, sig);

      // 7,500,000 kobo → ₦75,000
      expect(txMock.studentFee.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { amountPaid: expect.objectContaining({ value: 75000 }) },
      }));
    });

    it('ignores non-success events without crediting', async () => {
      const payload = { event: 'charge.failed', data: { reference: 'PSK_ref123', amount: 7500000, status: 'failed' } };
      const { raw, sig } = signedBody(payload);

      const result = await svc.handlePaystackWebhook(raw, sig);

      expect(result.received).toBe(true);
      expect(txMock.payment.update).not.toHaveBeenCalled();
    });
  });

  // ════════════════════ REMITA: VERIFY-CALLBACK PATTERN ═══════════════════════════
  describe('handleRemitaWebhook() — verify-callback pattern', () => {
    // P0-13 FIX (this pass — see docs/CHANGELOG.md): this test's
    // name and body describe pre-NEW-3-fix behavior — crediting a payment
    // directly from the webhook payload's self-reported status field. The
    // NEW-3 fix (see handleRemitaWebhook's own comments) deliberately
    // removed that: an attacker who knows a valid RRR (visible to the
    // student in their own payment history) could forge a success webhook
    // and get credited without paying. The test was never updated when
    // that fix shipped, so it was asserting for a vulnerability the code
    // no longer has. Rewritten to verify the CURRENT, intentional,
    // more-secure behavior — acknowledge-and-queue-reconciliation, never
    // credit directly from the webhook body — rather than reverting the
    // security fix to make the old assertion pass again.
    it('acknowledges a "00" (success) webhook WITHOUT crediting the payment directly (NEW-3: ping-only)', async () => {
      const payload = { rrr: 'RRR123456789', status: '00' };
      const raw = Buffer.from(JSON.stringify(payload));

      const result = await svc.handleRemitaWebhook(raw, undefined);

      expect(result.received).toBe(true);
      expect(txMock.payment.update).not.toHaveBeenCalled();
      expect(txMock.payment.findFirst).not.toHaveBeenCalled(); // confirmPayment() itself must never run from this path
    });

    it('does NOT credit when status is not success', async () => {
      const payload = { rrr: 'RRR123456789', status: '021' }; // Remita "pending" code
      const raw = Buffer.from(JSON.stringify(payload));

      const result = await svc.handleRemitaWebhook(raw, undefined);

      expect(result.received).toBe(true);
      expect(txMock.payment.update).not.toHaveBeenCalled();
    });

    it('throws BadRequestException when rrr is missing', async () => {
      const raw = Buffer.from(JSON.stringify({ status: '00' }));
      await expect(svc.handleRemitaWebhook(raw, undefined)).rejects.toThrow(BadRequestException);
    });

    it('never blocks on advisory signature mismatch — proceeds to verify-callback', async () => {
      const payload = { rrr: 'RRR123456789', status: '00' };
      const raw = Buffer.from(JSON.stringify(payload));

      prisma.payment.findUnique.mockResolvedValue(makePayment({ providerRef: 'RRR123456789', provider: PaymentProvider.REMITA }));
      txMock.payment.findFirst.mockResolvedValue(makePayment({ providerRef: 'RRR123456789', provider: PaymentProvider.REMITA }));
      txMock.studentFee.findUniqueOrThrow
        .mockResolvedValueOnce(makeFee())
        .mockResolvedValueOnce(makeFee({ amountPaid: new FakeDecimal(75000) }));
      txMock.studentFee.count.mockResolvedValue(0);
      txMock.student.findUniqueOrThrow.mockResolvedValue({ feeCleared: false });

      // Garbage signature — should NOT throw, advisory only
      const result = await svc.handleRemitaWebhook(raw, 'garbage-signature-xyz');
      expect(result.received).toBe(true);
    });
  });

  // ════════════════════ INITIATE PAYMENT ═══════════════════════════════════════
  describe('initiatePayment()', () => {
    // Deep-audit fix (Aug 2026): initiatePayment() now makes a real
    // outbound call to Paystack's /transaction/initialize (previously a
    // locally-generated fake reference — see the flagship "payment
    // gateway initiation is stubbed" finding). These tests mock
    // global.fetch and PAYSTACK_SECRET_KEY rather than letting a unit
    // test reach the network.
    const ORIGINAL_ENV = process.env.PAYSTACK_SECRET_KEY;
    let fetchSpy: jest.SpyInstance;

    beforeEach(() => {
      process.env.PAYSTACK_SECRET_KEY = 'sk_test_fake';
      // The hardened flow creates a committed INITIATING row before provider
      // I/O, then updates the same partition-aware payment key to PENDING.
      txMock.payment.findFirst.mockResolvedValue(null);
      txMock.payment.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        makePayment({ id: 'new-pay', createdAt: new Date('2026-08-14T10:00:00.000Z'), ...data }),
      );
      txMock.payment.update.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        makePayment({ id: 'new-pay', createdAt: new Date('2026-08-14T10:00:00.000Z'), ...data }),
      );
      fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          status: true,
          data: { reference: 'PSK_ref123', authorization_url: 'https://checkout.paystack.com/PSK_ref123' },
        }),
      } as Response);
    });
    afterEach(() => {
      fetchSpy.mockRestore();
      if (ORIGINAL_ENV === undefined) delete process.env.PAYSTACK_SECRET_KEY;
      else process.env.PAYSTACK_SECRET_KEY = ORIGINAL_ENV;
    });

    it('creates a PENDING payment with a reference from the payment gateway', async () => {
      prisma.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee());
      txMock.payment.create.mockResolvedValue(makePayment({
        id: 'new-pay',
        status: PaymentStatus.INITIATING,
        providerRef: 'PSK_initial',
        initiationLeaseUntil: new Date(Date.now() + 120_000),
      }));
      txMock.payment.update.mockResolvedValue(makePayment({
        id: 'new-pay',
        status: PaymentStatus.PENDING,
        providerRef: 'PSK_ref123',
        metadata: { authorizationUrl: 'https://checkout.paystack.com/PSK_ref123' },
      }));

      const result = await svc.initiatePayment({ studentFeeId: 'fee-1', provider: PaymentProvider.PAYSTACK }, 'stu-1', 'payment-initiation-test-key-0001');

      expect(result.provider).toBe(PaymentProvider.PAYSTACK);
      expect(result.providerRef).toBe('PSK_ref123');
      expect(fetchSpy).toHaveBeenCalledWith(
        'https://api.paystack.co/transaction/initialize',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    it('replays the original Paystack checkout URL without contacting the provider again for the same idempotency key', async () => {
      prisma.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee());
      txMock.payment.findFirst.mockResolvedValue(makePayment({
        id: 'existing-pay',
        amount: new FakeDecimal(75000),
        metadata: { authorizationUrl: 'https://checkout.paystack.com/existing-session' },
      }));

      const result = await svc.initiatePayment(
        { studentFeeId: 'fee-1', provider: PaymentProvider.PAYSTACK }, 'stu-1', 'payment-initiation-test-key-0001',
      );

      expect(result.paymentId).toBe('existing-pay');
      expect(result.reference).toBe('https://checkout.paystack.com/existing-session');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(txMock.payment.create).not.toHaveBeenCalled();
    });

    it('rejects reuse of an idempotency key when the requested amount changes', async () => {
      prisma.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee());
      txMock.payment.findFirst.mockResolvedValue(makePayment({ amount: new FakeDecimal(25000) }));

      await expect(svc.initiatePayment(
        { studentFeeId: 'fee-1', provider: PaymentProvider.PAYSTACK, amount: 25001 },
        'stu-1',
        'payment-initiation-test-key-0001',
      )).rejects.toThrow('different payment request');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(txMock.payment.create).not.toHaveBeenCalled();
    });

    it('does not contact a provider while the same idempotency key has an unexpired durable initiation lease', async () => {
      prisma.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee());
      txMock.payment.findFirst.mockResolvedValue(makePayment({
        amount: new FakeDecimal(75000),
        status: PaymentStatus.INITIATING,
        initiationLeaseUntil: new Date(Date.now() + 60_000),
      }));

      await expect(svc.initiatePayment(
        { studentFeeId: 'fee-1', provider: PaymentProvider.PAYSTACK },
        'stu-1',
        'payment-initiation-test-key-0001',
      )).rejects.toThrow('already in progress');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(txMock.payment.create).not.toHaveBeenCalled();
    });

    it('requires an idempotency key before any fee or provider work is performed', async () => {
      await expect(svc.initiatePayment({ studentFeeId: 'fee-1', provider: PaymentProvider.PAYSTACK }, 'stu-1'))
        .rejects.toThrow(BadRequestException);
      expect(prisma.studentFee.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('throws ServiceUnavailableException rather than a fake reference when PAYSTACK_SECRET_KEY is not configured', async () => {
      delete process.env.PAYSTACK_SECRET_KEY;
      prisma.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee());
      await expect(svc.initiatePayment({ studentFeeId: 'fee-1', provider: PaymentProvider.PAYSTACK }, 'stu-1', 'payment-initiation-test-key-0001'))
        .rejects.toThrow('not configured');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('rejects if the fee does not belong to the requesting student', async () => {
      prisma.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee({ studentId: 'other-student' }));
      await expect(svc.initiatePayment({ studentFeeId: 'fee-1', provider: PaymentProvider.PAYSTACK }, 'stu-1', 'payment-initiation-test-key-0001'))
        .rejects.toThrow(UnauthorizedException);
    });

    it('rejects if fee is already PAID', async () => {
      prisma.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee({ status: FeeStatus.PAID }));
      await expect(svc.initiatePayment({ studentFeeId: 'fee-1', provider: PaymentProvider.PAYSTACK }, 'stu-1', 'payment-initiation-test-key-0001'))
        .rejects.toThrow(ConflictException);
    });

    it('rejects an amount exceeding the outstanding balance', async () => {
      prisma.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee()); // 75000 outstanding
      await expect(svc.initiatePayment({ studentFeeId: 'fee-1', provider: PaymentProvider.PAYSTACK, amount: 100000 }, 'stu-1', 'payment-initiation-test-key-0001'))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('recordTsaPayment()', () => {
    it('rejects an amount above the fee outstanding balance before claiming the receipt', async () => {
      prisma.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee());

      await expect(svc.recordTsaPayment({ studentFeeId: 'fee-1', amount: 100000, tsaReference: 'gifmis-over-limit' }, 'bursar-1'))
        .rejects.toThrow('must be between');
      expect(txMock.paymentReceiptClaim.create).not.toHaveBeenCalled();
      expect(txMock.payment.create).not.toHaveBeenCalled();
    });

    it('rejects a duplicate TSA receipt claim before creating another payment row', async () => {
      prisma.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee());
      txMock.paymentReceiptClaim.findUnique.mockResolvedValue({ id: 'claim-1', receiptReference: 'GIFMIS-123' });

      await expect(svc.recordTsaPayment({ studentFeeId: 'fee-1', amount: 1000, tsaReference: 'gifmis-123' }, 'bursar-1'))
        .rejects.toThrow('already been recorded');
      expect(txMock.payment.create).not.toHaveBeenCalled();
      expect(txMock.paymentReceiptClaim.create).not.toHaveBeenCalled();
    });
  });
});
