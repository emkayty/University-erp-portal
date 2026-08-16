import { ConflictException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ResultStatus } from '@prisma/client';

import { computeCgpa, computeGrade } from '@uniportal/utils';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { OutboxService } from '../../common/outbox/outbox.service';
import { RlsContextService } from '../../common/rls/rls-context.service';
import { ResultsService } from './results.service';

class FakeDecimal {
  constructor(public value: number) {}
  toNumber() { return this.value; }
  toString() { return String(this.value); }
}

const makeResult = (o: Partial<Record<string, unknown>> = {}) => ({
  id: 'res-1', studentId: 'stu-1', courseOfferingId: 'co-1', semesterId: 'sem-1',
  score: new FakeDecimal(72), grade: 'A', gradePoint: new FakeDecimal(5.0), attemptNumber: 1,
  creditUnits: 3, absentFromExam: false, status: ResultStatus.DRAFT,
  submittedById: 'staff-1', approvedByHodId: null, hodApprovedAt: null,
  approvedByDeanId: null, deanApprovedAt: null,
  senatePendingAt: null, senatePublishedAt: null, rejectionReason: null,
  isAmended: false, amendmentReason: null, amendedById: null, amendedAt: null,
  withheldReason: null, withheldById: null, withheldAt: null,
  createdAt: new Date(), updatedAt: new Date(), ...o,
});

const makePublishedResultRow = (o: Partial<Record<string, unknown>> = {}) => ({
  gradePoint: new FakeDecimal(5.0), creditUnits: 3, grade: 'A', attemptNumber: 1,
  courseOfferingId: 'co-1', senatePublishedAt: new Date(),
  courseOffering: { courseId: 'csc-301' },
  ...o,
});

// ── Pure utility tests ─────────────────────────────────────────────────────────
describe('computeGrade() — Nigerian 5-point scale', () => {
  it.each([
    [100, 'A', 5.0], [70, 'A', 5.0], [69, 'B', 4.0], [60, 'B', 4.0],
    [59, 'C', 3.0], [50, 'C', 3.0], [49, 'D', 2.0], [45, 'D', 2.0],
    [44, 'E', 1.0], [40, 'E', 1.0], [39, 'F', 0.0], [0,  'F', 0.0],
  ])('score=%i → grade=%s, gradePoint=%f', (score, grade, gp) => {
    const result = computeGrade(score);
    expect(result.grade).toBe(grade);
    expect(result.gradePoint).toBe(gp);
  });

  it('absent from exam → ABS (0.0) regardless of score', () => {
    const r = computeGrade(95, true);
    expect(r.grade).toBe('ABS');
    expect(r.gradePoint).toBe(0.0);
  });
});

describe('computeCgpa() — CGPA engine', () => {
  it('computes CGPA correctly from multiple results', () => {
    // A×3CU + B×3CU + C×2CU = (5×3 + 4×3 + 3×2) / (3+3+2) = 33/8 = 4.125
    const { cgpa } = computeCgpa([
      { grade: 'A', gradePoint: 5.0, creditUnits: 3 },
      { grade: 'B', gradePoint: 4.0, creditUnits: 3 },
      { grade: 'C', gradePoint: 3.0, creditUnits: 2 },
    ]);
    expect(cgpa).toBe(4.13); // rounded to 2dp
  });

  it('F grade reduces CGPA but does NOT earn credit units', () => {
    const { cgpa, totalCreditUnitsEarned } = computeCgpa([
      { grade: 'A', gradePoint: 5.0, creditUnits: 3 },
      { grade: 'F', gradePoint: 0.0, creditUnits: 3 },
    ]);
    // (5×3 + 0×3) / 6 = 15/6 = 2.5
    expect(cgpa).toBe(2.5);
    expect(totalCreditUnitsEarned).toBe(3); // only the A course earned units
  });

  it('empty results → cgpa=0, earnedCU=0', () => {
    const { cgpa, totalCreditUnitsEarned } = computeCgpa([]);
    expect(cgpa).toBe(0);
    expect(totalCreditUnitsEarned).toBe(0);
  });
});

// ── ResultsService integration tests ──────────────────────────────────────────
describe('ResultsService', () => {
  let svc: ResultsService;
  let prisma: Record<string, Record<string, jest.Mock>> & { forRequest: jest.Mock; runExclusive: jest.Mock };
  let audit:  jest.Mocked<AuditService>;
  let outbox: jest.Mocked<OutboxService>;
  let txMock: Record<string, Record<string, jest.Mock>> & { $executeRaw: jest.Mock };
  let callOrder: string[];

  beforeEach(async () => {
    callOrder = [];

    txMock = {
      // P1-1 FIX: recomputeAndApplyCgpa() now opens with an advisory lock.
      // Recording call order (not just call count) is what actually proves
      // the lock is acquired BEFORE the racy read, not just that it's
      // called somewhere — see the "P1-1: CGPA advisory lock" describe
      // block below for why that ordering is the property that matters.
      $executeRaw: jest.fn().mockImplementation((strings: TemplateStringsArray) => {
        if (strings.join('').includes('pg_advisory_xact_lock')) callOrder.push('lock');
        return Promise.resolve(1);
      }),
      studentResult: {
        update:     jest.fn().mockImplementation((args) => ({ ...makeResult(), ...args.data })),
        create:     jest.fn().mockImplementation((args) => ({ ...makeResult(), ...args.data })),
        findMany:   jest.fn().mockImplementation(() => {
          callOrder.push('cgpa-read');
          return Promise.resolve([
            makePublishedResultRow({ gradePoint: new FakeDecimal(5.0), creditUnits: 3, grade: 'A' }),
            makePublishedResultRow({ gradePoint: new FakeDecimal(4.0), creditUnits: 3, grade: 'B' }),
          ]);
        }),
        findUnique: jest.fn().mockResolvedValue(null),
      },
      student: {
        update: jest.fn().mockResolvedValue({ id: 'stu-1', level: 100, status: 'ACTIVE', cgpa: new FakeDecimal(0) }),
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'stu-1', status: 'ACTIVE', cgpa: new FakeDecimal(0) }),
        findUnique: jest.fn().mockResolvedValue({ id: 'stu-1', status: 'ACTIVE' }),
      },
      courseOffering: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'co-1', semesterId: 'sem-1', lecturerId: 'staff-1', course: { creditUnits: 3, code: 'CSC301', id: 'csc-301' } }),
      },
      courseRegistration: {
        findFirst: jest.fn().mockResolvedValue({ id: 'reg-1' }),
      },
      staff: {
        findFirst: jest.fn().mockResolvedValue({ id: 'staff-1' }),
      },
      // AUDIT-C2 fix: recomputeAndApplyCgpa() (shared by publish/amend/
      // withhold/releaseWithhold) reads courseRepeatPolicy inside the tx —
      // this was already required by the pre-fix publishToSenate() too.
      institutionSettings: {
        findFirst: jest.fn().mockResolvedValue({ courseRepeatPolicy: 'INCLUDE', deanApprovalRequired: false }),
      },
      auditLog: { create: jest.fn() },
      domainEvent: { create: jest.fn() },
      resultVersion: { create: jest.fn().mockResolvedValue({}) },
      semester: { findUnique: jest.fn().mockResolvedValue(null) },
      studentAcademicHistory: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    } as never;

    prisma = {
      studentResult: {
        findUniqueOrThrow: jest.fn().mockResolvedValue(makeResult()),
        findUnique:        jest.fn().mockResolvedValue(null),
        create:            jest.fn().mockResolvedValue(makeResult()),
        update:            jest.fn().mockResolvedValue(makeResult()),
        findMany:          jest.fn().mockResolvedValue([]),
      },
      courseOffering: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'co-1', course: { creditUnits: 3, code: 'CSC301' },
        }),
      },
      student: { update: jest.fn() },
      // AUDIT-C3 fix: processAction() now reads this BEFORE opening any
      // transaction, to decide whether HOD_APPROVED routes through
      // DEAN_APPROVED or straight to SENATE_PENDING. Default false
      // preserves every pre-existing test's expected behavior.
      institutionSettings: {
        findFirst: jest.fn().mockResolvedValue({ deanApprovalRequired: false }),
      },
      // P0-2 FIX: ResultsService now calls forRequest()/runExclusive()
      // instead of touching the client or $transaction directly.
      // forRequest() returning `prisma` itself (rather than a separate
      // ambient tx client) reproduces the "no active RLS transaction"
      // fallback branch of the real PrismaService.forRequest() — the
      // branch every pre-existing test in this file already assumes, since
      // none of them set up an ambient RlsContextService context. This
      // keeps every prisma.studentResult.* assertion below valid unchanged.
      forRequest:   jest.fn().mockImplementation(() => prisma),
      runExclusive: jest.fn((_rlsContext: unknown, fn: (tx: unknown) => unknown) => fn(txMock)),
    } as never;

    audit  = { log: jest.fn() } as unknown as jest.Mocked<AuditService>;
    outbox = { write: jest.fn().mockResolvedValue(undefined) } as unknown as jest.Mocked<OutboxService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResultsService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService,  useValue: audit },
        { provide: OutboxService, useValue: outbox },
        { provide: RlsContextService, useValue: {} }, // opaque — only ever passed through to the mocked forRequest/runExclusive above
      ],
    }).compile();

    svc = module.get<ResultsService>(ResultsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── submitResult() ────────────────────────────────────────────────────────
  describe('submitResult()', () => {
    it('computes grade from score before saving (A=5.0 for score 72)', async () => {
      await svc.submitResult({ studentId: 'stu-1', courseOfferingId: 'co-1', semesterId: 'sem-1', score: 72 }, 'staff-1', 'STAFF');
      expect(txMock.studentResult.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ grade: 'A', gradePoint: 5.0, creditUnits: 3 }),
      }));
    });

    it('updates existing DRAFT result instead of creating duplicate', async () => {
      txMock.studentResult.findUnique.mockResolvedValueOnce(makeResult({ status: ResultStatus.DRAFT }));
      await svc.submitResult({ studentId: 'stu-1', courseOfferingId: 'co-1', semesterId: 'sem-1', score: 65 }, 'staff-1', 'STAFF');
      expect(txMock.studentResult.update).toHaveBeenCalled();
      expect(txMock.studentResult.create).not.toHaveBeenCalled();
    });

    it('rejects update when result is already beyond DRAFT (HOD_APPROVED)', async () => {
      txMock.studentResult.findUnique.mockResolvedValueOnce(makeResult({ status: ResultStatus.HOD_APPROVED }));
      await expect(svc.submitResult({ studentId: 'stu-1', courseOfferingId: 'co-1', semesterId: 'sem-1', score: 65 }, 'staff-1', 'STAFF'))
        .rejects.toThrow(ConflictException);
    });

    it('marks absent student as grade F regardless of score field', async () => {
      await svc.submitResult({ studentId: 'stu-1', courseOfferingId: 'co-1', semesterId: 'sem-1', score: 0, absentFromExam: true }, 'staff-1', 'STAFF');
      expect(txMock.studentResult.create).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ grade: 'ABS', gradePoint: 0.0, absentFromExam: true }),
      }));
    });
  });

  // ── FSM transitions ───────────────────────────────────────────────────────
  describe('applyAction() — FSM', () => {
    it('HOD_APPROVE on DRAFT → HOD_APPROVED (HOD role allowed)', async () => {
      await svc.applyAction('res-1', { action: 'HOD_APPROVE' }, 'hod-1', 'HOD');
      expect(prisma.studentResult.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: ResultStatus.HOD_APPROVED, approvedByHodId: 'hod-1' }),
      }));
    });

    it('HOD_APPROVE on DRAFT → forbidden for STAFF role', async () => {
      await expect(svc.applyAction('res-1', { action: 'HOD_APPROVE' }, 'staff-1', 'STAFF'))
        .rejects.toThrow(ForbiddenException);
    });

    it('HOD_APPROVE on SENATE_PENDING → UnprocessableEntity (wrong state)', async () => {
      prisma.studentResult.findUniqueOrThrow.mockResolvedValueOnce(makeResult({ status: ResultStatus.SENATE_PENDING }));
      await expect(svc.applyAction('res-1', { action: 'HOD_APPROVE' }, 'hod-1', 'HOD'))
        .rejects.toThrow(UnprocessableEntityException);
    });

    it('SUBMIT_SENATE on HOD_APPROVED → SENATE_PENDING (deanApprovalRequired=false)', async () => {
      prisma.studentResult.findUniqueOrThrow.mockResolvedValueOnce(makeResult({ status: ResultStatus.HOD_APPROVED }));
      await svc.applyAction('res-1', { action: 'SUBMIT_SENATE' }, 'hod-1', 'HOD');
      expect(prisma.studentResult.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: ResultStatus.SENATE_PENDING }),
      }));
    });

    it('REJECT requires rejectionReason — throws without it', async () => {
      prisma.studentResult.findUniqueOrThrow.mockResolvedValueOnce(makeResult({ status: ResultStatus.HOD_APPROVED }));
      await expect(svc.applyAction('res-1', { action: 'REJECT' }, 'hod-1', 'HOD'))
        .rejects.toThrow('Rejection reason is required');
    });

    // ── AUDIT-C3: deanApprovalRequired flag now actually read ───────────────
    describe('when deanApprovalRequired=true', () => {
      beforeEach(() => {
        prisma.institutionSettings.findFirst.mockResolvedValue({ deanApprovalRequired: true });
      });

      it('SUBMIT_SENATE on HOD_APPROVED is now REJECTED — must go through DEAN_APPROVE first', async () => {
        prisma.studentResult.findUniqueOrThrow.mockResolvedValueOnce(makeResult({ status: ResultStatus.HOD_APPROVED }));
        await expect(svc.applyAction('res-1', { action: 'SUBMIT_SENATE' }, 'hod-1', 'HOD'))
          .rejects.toThrow(UnprocessableEntityException);
      });

      it('DEAN_APPROVE on HOD_APPROVED → DEAN_APPROVED (DEAN role)', async () => {
        prisma.studentResult.findUniqueOrThrow.mockResolvedValueOnce(makeResult({ status: ResultStatus.HOD_APPROVED }));
        await svc.applyAction('res-1', { action: 'DEAN_APPROVE' }, 'dean-1', 'DEAN');
        expect(prisma.studentResult.update).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({ status: ResultStatus.DEAN_APPROVED, approvedByDeanId: 'dean-1' }),
        }));
      });

      it('DEAN_APPROVE forbidden for HOD role — only DEAN/SUPER_ADMIN', async () => {
        prisma.studentResult.findUniqueOrThrow.mockResolvedValueOnce(makeResult({ status: ResultStatus.HOD_APPROVED }));
        await expect(svc.applyAction('res-1', { action: 'DEAN_APPROVE' }, 'hod-1', 'HOD'))
          .rejects.toThrow(ForbiddenException);
      });

      it('SUBMIT_SENATE on DEAN_APPROVED → SENATE_PENDING', async () => {
        prisma.studentResult.findUniqueOrThrow.mockResolvedValueOnce(makeResult({ status: ResultStatus.DEAN_APPROVED }));
        await svc.applyAction('res-1', { action: 'SUBMIT_SENATE' }, 'dean-1', 'DEAN');
        expect(prisma.studentResult.update).toHaveBeenCalledWith(expect.objectContaining({
          data: expect.objectContaining({ status: ResultStatus.SENATE_PENDING }),
        }));
      });
    });
  });

  // ── M1: Atomic CGPA on senate-publish ─────────────────────────────────────
  describe('SENATE_PUBLISH — M1 atomic CGPA', () => {
    beforeEach(() => {
      prisma.studentResult.findUniqueOrThrow.mockResolvedValue(makeResult({ status: ResultStatus.SENATE_PENDING }));
    });

    it('updates Student.cgpa in the SAME $transaction as SENATE_PUBLISHED status', async () => {
      // txMock already returns 2 published results: A×3 + B×3 → CGPA = (15+12)/6 = 4.5
      await svc.applyAction('res-1', { action: 'SENATE_PUBLISH' }, 'registrar-1', 'REGISTRAR');

      expect(txMock.studentResult.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: ResultStatus.SENATE_PUBLISHED }),
      }));
      expect(txMock.student.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { cgpa: 4.5, totalCreditUnitsEarned: 6 },
      }));
    });

    it('writes outbox event in SAME transaction as senate-publish (S1)', async () => {
      await svc.applyAction('res-1', { action: 'SENATE_PUBLISH' }, 'registrar-1', 'REGISTRAR');
      expect(outbox.write).toHaveBeenCalledWith(txMock, 'result.senate_published', expect.objectContaining({
        resultId: 'res-1', studentId: 'stu-1', cgpa: 4.5,
      }));
    });

    it('F grade lowers CGPA but does NOT earn credit units (totalCreditUnitsEarned excludes F)', async () => {
      txMock.studentResult.findMany.mockResolvedValueOnce([
        makePublishedResultRow({ gradePoint: new FakeDecimal(5.0), creditUnits: 3, grade: 'A' }),
        makePublishedResultRow({ gradePoint: new FakeDecimal(0.0), creditUnits: 3, grade: 'F' }),
      ]);
      await svc.applyAction('res-1', { action: 'SENATE_PUBLISH' }, 'registrar-1', 'REGISTRAR');
      expect(txMock.student.update).toHaveBeenCalledWith(expect.objectContaining({
        data: { cgpa: 2.5, totalCreditUnitsEarned: 3 }, // only A-grade CU earned
      }));
    });

    it('SENATE_PUBLISH forbidden for HOD role — requires REGISTRAR/VC/SUPER_ADMIN', async () => {
      await expect(svc.applyAction('res-1', { action: 'SENATE_PUBLISH' }, 'hod-1', 'HOD'))
        .rejects.toThrow(ForbiddenException);
      expect(txMock.student.update).not.toHaveBeenCalled();
    });
  });

  // ── AUDIT-C2: amend() — previously did not exist ──────────────────────────
  describe('amend()', () => {
    beforeEach(() => {
      prisma.studentResult.findUniqueOrThrow.mockResolvedValue(
        makeResult({ status: ResultStatus.SENATE_PUBLISHED, score: new FakeDecimal(55), grade: 'C' }),
      );
    });

    it('updates score/grade and recomputes CGPA in ONE transaction', async () => {
      const result = await svc.amend('res-1', { newScore: 82, amendmentReason: 'Marking error corrected by exam board' }, 'hod-1', 'HOD');

      expect(txMock.studentResult.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({
          score: 82, grade: 'A', isAmended: true,
          amendmentReason: 'Marking error corrected by exam board', amendedById: 'hod-1',
        }),
      }));
      expect(txMock.student.update).toHaveBeenCalled(); // CGPA recomputed
      expect(result.result.grade).toBe('A');
    });

    it('rejects amending a result that is not SENATE_PUBLISHED', async () => {
      prisma.studentResult.findUniqueOrThrow.mockResolvedValueOnce(makeResult({ status: ResultStatus.DRAFT }));
      await expect(svc.amend('res-1', { newScore: 82, amendmentReason: 'test' }, 'hod-1', 'HOD'))
        .rejects.toThrow(UnprocessableEntityException);
    });

    it('forbidden for STAFF/REGISTRAR — only HOD/DEAN/SUPER_ADMIN may amend', async () => {
      await expect(svc.amend('res-1', { newScore: 82, amendmentReason: 'test' }, 'registrar-1', 'REGISTRAR'))
        .rejects.toThrow(ForbiddenException);
    });

    it('writes result.amended to the outbox with old and new grade', async () => {
      await svc.amend('res-1', { newScore: 82, amendmentReason: 'test' }, 'hod-1', 'HOD');
      expect(outbox.write).toHaveBeenCalledWith(txMock, 'result.amended', expect.objectContaining({
        oldGrade: 'C', newGrade: 'A',
      }));
    });
  });

  // ── AUDIT-C2: withhold() / releaseWithhold() — previously did not exist ───
  describe('withhold() / releaseWithhold()', () => {
    it('withholds a SENATE_PUBLISHED result and excludes it from CGPA recompute', async () => {
      prisma.studentResult.findUniqueOrThrow.mockResolvedValue(makeResult({ status: ResultStatus.SENATE_PUBLISHED }));
      await svc.withhold('res-1', { withheldReason: 'Pending disciplinary panel' }, 'registrar-1', 'REGISTRAR');

      expect(txMock.studentResult.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: ResultStatus.WITHHELD, withheldReason: 'Pending disciplinary panel' }),
      }));
      expect(txMock.student.update).toHaveBeenCalled();
    });

    it('withhold forbidden for HOD — only REGISTRAR/SUPER_ADMIN', async () => {
      prisma.studentResult.findUniqueOrThrow.mockResolvedValue(makeResult({ status: ResultStatus.SENATE_PUBLISHED }));
      await expect(svc.withhold('res-1', { withheldReason: 'test' }, 'hod-1', 'HOD'))
        .rejects.toThrow(ForbiddenException);
    });

    it('releaseWithhold restores SENATE_PUBLISHED and recomputes CGPA', async () => {
      prisma.studentResult.findUniqueOrThrow.mockResolvedValue(makeResult({ status: ResultStatus.WITHHELD }));
      await svc.releaseWithhold('res-1', 'registrar-1', 'REGISTRAR');

      expect(txMock.studentResult.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: ResultStatus.SENATE_PUBLISHED, withheldReason: null }),
      }));
      expect(txMock.student.update).toHaveBeenCalled();
    });

    it('releaseWithhold rejects a result that is not currently WITHHELD', async () => {
      prisma.studentResult.findUniqueOrThrow.mockResolvedValue(makeResult({ status: ResultStatus.SENATE_PUBLISHED }));
      await expect(svc.releaseWithhold('res-1', 'registrar-1', 'REGISTRAR'))
        .rejects.toThrow(UnprocessableEntityException);
    });
  });

  // ── P1-1 FIX: CGPA advisory lock (this pass — see docs/CHANGELOG.md) ──
  // These tests can't spin up two literal concurrent Postgres connections in
  // a Jest unit test — that would need an integration test against a real
  // database. What they CAN and do prove directly: (1) every path that
  // mutates CGPA actually issues the lock statement, with the studentId as
  // its key, and (2) the lock is acquired BEFORE the racy read, not after —
  // which is the exact ordering that makes the lock effective. A future
  // refactor that accidentally moved the lock after the read, or dropped it
  // from one of the four call sites, would fail these tests immediately.
  describe('P1-1: CGPA advisory lock in recomputeAndApplyCgpa()', () => {
    it('publishToSenate: acquires pg_advisory_xact_lock(hashtext(studentId)) before reading published results', async () => {
      prisma.studentResult.findUniqueOrThrow.mockResolvedValue(makeResult({ status: ResultStatus.SENATE_PENDING }));
      await svc.applyAction('res-1', { action: 'SENATE_PUBLISH' }, 'registrar-1', 'REGISTRAR');

      expect(txMock.$executeRaw).toHaveBeenCalled();
      const [strings, key] = txMock.$executeRaw.mock.calls[0] as [TemplateStringsArray, string];
      expect(strings.join('')).toContain('pg_advisory_xact_lock(hashtext(');
      expect(key).toBe('stu-1'); // makeResult()'s studentId
      expect(callOrder).toEqual(['lock', 'cgpa-read']); // lock strictly before the read
    });

    it('amend: acquires the lock before recomputing CGPA', async () => {
      prisma.studentResult.findUniqueOrThrow.mockResolvedValue(
        makeResult({ status: ResultStatus.SENATE_PUBLISHED, score: new FakeDecimal(55), grade: 'C' }),
      );
      await svc.amend('res-1', { newScore: 82, amendmentReason: 'test' }, 'hod-1', 'HOD');
      expect(callOrder).toEqual(['lock', 'cgpa-read']);
    });

    it('withhold: acquires the lock before recomputing CGPA', async () => {
      prisma.studentResult.findUniqueOrThrow.mockResolvedValue(makeResult({ status: ResultStatus.SENATE_PUBLISHED }));
      await svc.withhold('res-1', { withheldReason: 'test' }, 'registrar-1', 'REGISTRAR');
      expect(callOrder).toEqual(['lock', 'cgpa-read']);
    });

    it('releaseWithhold: acquires the lock before recomputing CGPA', async () => {
      prisma.studentResult.findUniqueOrThrow.mockResolvedValue(makeResult({ status: ResultStatus.WITHHELD }));
      await svc.releaseWithhold('res-1', 'registrar-1', 'REGISTRAR');
      expect(callOrder).toEqual(['lock', 'cgpa-read']);
    });

    it('locks on the STUDENT, not the result — two different results for the same student use the same lock key', async () => {
      prisma.studentResult.findUniqueOrThrow.mockResolvedValue(
        makeResult({ id: 'res-2', studentId: 'stu-shared', status: ResultStatus.SENATE_PUBLISHED }),
      );
      await svc.withhold('res-2', { withheldReason: 'test' }, 'registrar-1', 'REGISTRAR');
      const [, key] = txMock.$executeRaw.mock.calls[0] as [TemplateStringsArray, string];
      expect(key).toBe('stu-shared');
    });
  });
});
