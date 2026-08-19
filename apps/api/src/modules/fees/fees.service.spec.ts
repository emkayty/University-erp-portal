import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FeeStatus, WaiverStatus } from '@prisma/client';

import { AuditService } from '../../common/audit/audit.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { PrismaService } from '../../database/prisma.service';
import { FeeClearanceService } from './fee-clearance.service';
import { FeesService } from './fees.service';

class FakeDecimal {
  constructor(public value: number) {}
  // P0-15 FIX (this pass — see docs/CHANGELOG.md): add() used to
  // take `n: number` and do `this.value + n` with no unwrapping — unlike
  // sub()/gte() right below, which already correctly handle a FakeDecimal
  // argument via `n instanceof FakeDecimal ? n.value : n`. The real
  // application code (fees.service.ts: `fee.waiverAmount.add(waiver.
  // waiverAmount)`) passes a Decimal-like OBJECT, matching how Prisma's
  // real Decimal.add() accepts another Decimal — which this fake must
  // support to actually emulate it. With the old signature, `this.value +
  // n` (a number plus a FakeDecimal object) fell through JS's default `+`
  // coercion: FakeDecimal has a toString() but no valueOf(), so the object
  // stringified to e.g. "25000" and `0 + "25000"` became STRING
  // CONCATENATION, producing "025000" instead of the number 25000 — a
  // test-fixture bug, not a bug in fees.service.ts or in the real Prisma
  // Decimal type, which handles Decimal-plus-Decimal arithmetic correctly.
  add(n: FakeDecimal | number) { return new FakeDecimal(this.value + (n instanceof FakeDecimal ? n.value : n)); }
  sub(n: FakeDecimal | number) { return new FakeDecimal(this.value - (n instanceof FakeDecimal ? n.value : n)); }
  gte(n: FakeDecimal | number) { return this.value >= (n instanceof FakeDecimal ? n.value : n); }
  gt(n: number)  { return this.value > n; }
  // Deep-audit fix (Aug 2026): added for the cumulative fee-waiver-cap fix
  // (fee.waiverAmount.div(fee.amount).mul(100)) — same reasoning as add()
  // above applies to div()/mul(): unwrap a FakeDecimal argument rather
  // than falling through JS's default coercion.
  div(n: FakeDecimal | number)  { return new FakeDecimal(this.value / (n instanceof FakeDecimal ? n.value : n)); }
  mul(n: FakeDecimal | number)  { return new FakeDecimal(this.value * (n instanceof FakeDecimal ? n.value : n)); }
  isZero()       { return this.value === 0; }
  toNumber()     { return this.value; }
  toString()     { return String(this.value); }
}

const makeFee = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'fee-1', studentId: 'stu-1', feeScheduleId: 'sched-1',
  academicYear: '2025/2026', invoiceNo: 'INV-20252026-TUI-stu1-001',
  amount: new FakeDecimal(100000), amountPaid: new FakeDecimal(0),
  waiverAmount: new FakeDecimal(0), status: FeeStatus.PENDING,
  dueDate: null, createdAt: new Date(), updatedAt: new Date(),
  student: { departmentId: 'dept-1' }, ...o,
});

const makeSettings = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'settings-1',
  feeWaiverCapHodPct:    new FakeDecimal(30),
  feeWaiverCapBursarPct: new FakeDecimal(80),
  ...o,
});

const makeWaiver = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'waiver-1', studentFeeId: 'fee-1', requestedById: 'hod-1', approvedById: null,
  waiverPct: new FakeDecimal(25), waiverAmount: new FakeDecimal(25000),
  reason: 'Documented financial hardship case', status: WaiverStatus.PENDING,
  createdAt: new Date(), decidedAt: null, ...o,
});

describe('FeesService', () => {
  let svc: FeesService;
  let prisma: Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock };
  let audit: jest.Mocked<AuditService>;
  let clearance: jest.Mocked<FeeClearanceService>;
  let outbox: jest.Mocked<OutboxService>;
  let txMock: Record<string, Record<string, jest.Mock>> & { $queryRaw: jest.Mock };

  beforeEach(async () => {
    txMock = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      feeSchedule: { findUniqueOrThrow: jest.fn() },
      feeWaiver:  { create: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn() },
      studentFee: { findUniqueOrThrow: jest.fn(), update: jest.fn() },
    };

    prisma = {
      feeSchedule:  { create: jest.fn(), update: jest.fn(), findUniqueOrThrow: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      programme:    { findUniqueOrThrow: jest.fn() },
      studentFee:   { findMany: jest.fn().mockResolvedValue([]), findUniqueOrThrow: jest.fn() },
      feeWaiver:    { findUniqueOrThrow: jest.fn(), update: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
      institutionSettings: { findFirstOrThrow: jest.fn().mockResolvedValue(makeSettings()) },
      $transaction: jest.fn((fn: (tx: typeof txMock) => unknown) => fn(txMock)),
    } as never;

    audit     = { log: jest.fn() } as unknown as jest.Mocked<AuditService>;
    clearance = { recomputeStudentFee: jest.fn().mockResolvedValue({ feeStatus: FeeStatus.PARTIAL, feeCleared: false, clearedChanged: false }) } as unknown as jest.Mocked<FeeClearanceService>;
    outbox = { write: jest.fn().mockResolvedValue('event-1') } as unknown as jest.Mocked<OutboxService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeesService,
        { provide: PrismaService,       useValue: prisma },
        { provide: AuditService,        useValue: audit },
        { provide: FeeClearanceService, useValue: clearance },
        { provide: OutboxService, useValue: outbox },
      ],
    }).compile();

    svc = module.get<FeesService>(FeesService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('requestWaiver() — role-based cap enforcement', () => {
    it('HOD requesting <=30% (cap) -> status PENDING, NOT auto-applied', async () => {
      txMock.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee());
      txMock.feeWaiver.create.mockResolvedValue(makeWaiver({ status: WaiverStatus.PENDING, waiverPct: new FakeDecimal(25) }));

      const result = await svc.requestWaiver(
        { studentFeeId: 'fee-1', waiverPct: 25, reason: 'Documented hardship case' },
        'hod-1', 'HOD', 'dept-1',
      );

      expect(result.status).toBe(WaiverStatus.PENDING);
      expect(txMock.studentFee.update).not.toHaveBeenCalled();
      expect(clearance.recomputeStudentFee).not.toHaveBeenCalled();
    });

    it('HOD requesting >30% (over cap) -> BadRequestException, nothing created', async () => {
      txMock.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee());

      await expect(svc.requestWaiver(
        { studentFeeId: 'fee-1', waiverPct: 31, reason: 'Wants more than allowed' },
        'hod-1', 'HOD', 'dept-1',
      )).rejects.toThrow(BadRequestException);

      expect(txMock.feeWaiver.create).not.toHaveBeenCalled();
    });

    it('Bursar requesting <=80% (cap) -> remains pending for independent approval', async () => {
      txMock.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee());
      txMock.feeWaiver.create.mockResolvedValue(makeWaiver({
        status: WaiverStatus.PENDING, waiverPct: new FakeDecimal(75), waiverAmount: new FakeDecimal(75000), approvedById: null,
      }));

      const result = await svc.requestWaiver(
        { studentFeeId: 'fee-1', waiverPct: 75, reason: 'Bursar-approved scholarship adjustment' },
        'bursar-1', 'BURSAR',
      );

      expect(result.status).toBe(WaiverStatus.PENDING);
      expect(txMock.studentFee.update).not.toHaveBeenCalled();
      expect(clearance.recomputeStudentFee).not.toHaveBeenCalled();
    });

    it('Bursar requesting >80% (over cap) -> BadRequestException', async () => {
      txMock.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee());

      await expect(svc.requestWaiver(
        { studentFeeId: 'fee-1', waiverPct: 81, reason: 'Over the bursar cap entirely' },
        'bursar-1', 'BURSAR',
      )).rejects.toThrow(BadRequestException);

      expect(txMock.feeWaiver.create).not.toHaveBeenCalled();
    });

    it('SUPER_ADMIN is treated as BURSAR cap but still requires independent approval', async () => {
      txMock.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee());
      txMock.feeWaiver.create.mockResolvedValue(makeWaiver({ status: WaiverStatus.PENDING, approvedById: null }));

      const result = await svc.requestWaiver(
        { studentFeeId: 'fee-1', waiverPct: 50, reason: 'Admin override for edge case' },
        'admin-1', 'SUPER_ADMIN',
      );

      expect(result.status).toBe(WaiverStatus.PENDING);
    });

    it('rejects waiver request from a role other than HOD/BURSAR/SUPER_ADMIN', async () => {
      txMock.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee());
      await expect(svc.requestWaiver(
        { studentFeeId: 'fee-1', waiverPct: 10, reason: 'Random staff member request' },
        'staff-1', 'STAFF',
      )).rejects.toThrow(ForbiddenException);
    });

    it('rejects waiver on an already-PAID fee', async () => {
      txMock.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee({ status: FeeStatus.PAID }));
      await expect(svc.requestWaiver(
        { studentFeeId: 'fee-1', waiverPct: 10, reason: 'Fee is already fully paid' },
        'bursar-1', 'BURSAR',
      )).rejects.toThrow(ConflictException);
    });
  });

  describe('approveWaiver() — Bursar approves HOD-requested waiver', () => {
    it('Bursar approves a PENDING HOD waiver within cap -> applies waiverAmount + recomputes', async () => {
      txMock.feeWaiver.findUniqueOrThrow.mockResolvedValue(makeWaiver({ status: WaiverStatus.PENDING, waiverPct: new FakeDecimal(25), waiverAmount: new FakeDecimal(25000) }));
      txMock.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee());

      const result = await svc.approveWaiver('waiver-1', 'bursar-1', 'BURSAR');

      expect(result.message).toContain('approved');
      expect(txMock.feeWaiver.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: WaiverStatus.APPROVED, approvedById: 'bursar-1' }),
      }));
      expect(txMock.studentFee.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { waiverAmount: expect.objectContaining({ value: 25000 }) },
      }));
      expect(clearance.recomputeStudentFee).toHaveBeenCalledWith(txMock, 'fee-1');
      expect(txMock.$queryRaw).toHaveBeenCalledTimes(2);
    });

    it('locks the waiver row before reading its status', async () => {
      txMock.feeWaiver.findUniqueOrThrow.mockResolvedValue(makeWaiver({ status: WaiverStatus.PENDING }));
      txMock.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee());

      await svc.approveWaiver('waiver-1', 'bursar-1', 'BURSAR');

      const waiverLockOrder = txMock.$queryRaw.mock.invocationCallOrder[0];
      const statusReadOrder = txMock.feeWaiver.findUniqueOrThrow.mock.invocationCallOrder[0];
      expect(waiverLockOrder).toBeLessThan(statusReadOrder);
    });

    it('rejects approval from non-Bursar/non-SuperAdmin (e.g. HOD cannot self-approve)', async () => {
      await expect(svc.approveWaiver('waiver-1', 'hod-1', 'HOD'))
        .rejects.toThrow(ForbiddenException);
      expect(txMock.feeWaiver.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it('rejects approving an already-decided waiver', async () => {
      txMock.feeWaiver.findUniqueOrThrow.mockResolvedValue(makeWaiver({ status: WaiverStatus.APPROVED }));
      await expect(svc.approveWaiver('waiver-1', 'bursar-1', 'BURSAR'))
        .rejects.toThrow(ConflictException);
    });

    it('re-validates against Bursar cap at approval time (settings may have changed)', async () => {
      txMock.feeWaiver.findUniqueOrThrow.mockResolvedValue(makeWaiver({ status: WaiverStatus.PENDING, waiverPct: new FakeDecimal(85) }));
      prisma.institutionSettings.findFirstOrThrow.mockResolvedValue(makeSettings({ feeWaiverCapBursarPct: new FakeDecimal(80) }));
      txMock.studentFee.findUniqueOrThrow.mockResolvedValue(makeFee());

      await expect(svc.approveWaiver('waiver-1', 'bursar-1', 'BURSAR'))
        .rejects.toThrow(BadRequestException);
      expect(txMock.feeWaiver.update).not.toHaveBeenCalled();
    });
  });

  describe('rejectWaiver()', () => {
    it('Bursar rejects a PENDING waiver with a note appended to reason', async () => {
      txMock.feeWaiver.findUniqueOrThrow.mockResolvedValue(makeWaiver({ status: WaiverStatus.PENDING }));

      const result = await svc.rejectWaiver('waiver-1', 'bursar-1', 'BURSAR', 'Insufficient documentation provided');

      expect(result.message).toContain('rejected');
      expect(txMock.feeWaiver.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: WaiverStatus.REJECTED, approvedById: 'bursar-1' }),
      }));
    });

    it('rejects rejection attempt from HOD role', async () => {
      await expect(svc.rejectWaiver('waiver-1', 'hod-1', 'HOD')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('generateInvoices()', () => {
    it('records a durable invoice-generation event with a stable event ID', async () => {
      txMock.feeSchedule.findUniqueOrThrow.mockResolvedValue({
        id: 'sched-1', isActive: true, feeType: 'TUITION', academicYear: '2025/2026',
      });

      const result = await svc.generateInvoices('sched-1', 'bursar-1');

      expect(outbox.write).toHaveBeenCalledWith(txMock, 'fees.invoice_generation_requested', { feeScheduleId: 'sched-1' });
      expect(result.jobId).toBe('event-1');
    });

    it('rejects generation for an inactive fee schedule', async () => {
      txMock.feeSchedule.findUniqueOrThrow.mockResolvedValue({ id: 'sched-1', isActive: false, feeType: 'TUITION', academicYear: '2025/2026' });

      await expect(svc.generateInvoices('sched-1', 'bursar-1')).rejects.toThrow(BadRequestException);
      expect(outbox.write).not.toHaveBeenCalled();
    });

    it('audit-logs the generation trigger with jobId', async () => {
      txMock.feeSchedule.findUniqueOrThrow.mockResolvedValue({ id: 'sched-1', isActive: true, feeType: 'ACCEPTANCE', academicYear: '2025/2026' });

      await svc.generateInvoices('sched-1', 'bursar-1');

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.objectContaining({ type: 'INVOICE_GENERATION_QUEUED', eventId: 'event-1' }) }),
        'bursar-1',
      );
    });
  });
});
