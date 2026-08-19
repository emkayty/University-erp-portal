import { ConflictException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PayrollStatus } from '@prisma/client';
import {
  computePayslip, computePaye, computeStatutoryDeductions,
  formatIppisRow, formatPencomRow, IPPIS_CSV_HEADER, PENCOM_CSV_HEADER,
} from '@uniportal/utils';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import { PayrollService } from './payroll.service';

class FakeDecimal {
  constructor(public value: number) {}
  toNumber() { return this.value; }
}

const makeRun = (o: Partial<Record<string,unknown>> = {}) => ({
  id: 'run-1', periodMonth: 10, periodYear: 2025, label: 'October 2025',
  status: PayrollStatus.DRAFT, totalGross: new FakeDecimal(0), totalNet: new FakeDecimal(0),
  totalDeductions: new FakeDecimal(0), staffCount: 0, initiatedById: 'bursar-1',
  approvedById: null, approvedAt: null, disbursedAt: null,
  ippisExportedAt: null, pencomExportedAt: null, notes: null,
  createdAt: new Date(), updatedAt: new Date(), ...o,
});

// ── Pure utility tests (no DB needed) ──────────────────────────────────────────
describe('Payroll computation utilities', () => {
  // Deep-audit fix (Aug 2026): this block previously described and tested
  // the pre-2026 CRA/PITA bands under the label "FIRSWA", with no
  // periodDate pinned — meaning every test below silently tracked whatever
  // regime happened to be "current" on the day the suite ran, and would
  // have started testing the Nigeria Tax Act 2025 bands the moment 2026
  // arrived without anyone noticing or updating the comments. Full
  // dedicated coverage of both regimes (including exact worked-example
  // verification of the NTA 2025 bands) now lives in
  // packages/utils/src/payroll.spec.ts, alongside the functions
  // themselves. These integration-style smoke tests are kept here, but
  // explicitly pinned to the current (NTA 2025) regime so they test one
  // well-defined thing rather than "whichever law is in force today".
  describe('computePaye() — Nigeria Tax Act 2025 bands (current regime, periods from 1 Jan 2026)', () => {
    const currentPeriod = { periodDate: new Date('2026-06-01') };

    it('zero-taxes employees at/below the ₦800,000 zero-rate band', () => {
      // Monthly gross ₦30,000 → annual ₦360,000. Minus 8% pension relief
      // (28,800), taxable income is 331,200 — well inside the 0% band.
      const paye = computePaye(30_000 * 12, currentPeriod);
      expect(paye).toBe(0);
    });

    it('computes positive PAYE for mid-range salary', () => {
      // Monthly gross ₦150,000 → annual ₦1,800,000
      const paye = computePaye(150_000 * 12, currentPeriod);
      expect(paye).toBeGreaterThan(0);
      expect(paye).toBeLessThan(150_000); // sanity: PAYE < gross
    });

    it('higher salary produces higher PAYE (progressive)', () => {
      const paye100k = computePaye(100_000 * 12, currentPeriod);
      const paye300k = computePaye(300_000 * 12, currentPeriod);
      expect(paye300k).toBeGreaterThan(paye100k);
    });
  });

  describe('computeStatutoryDeductions() — PenCom rates', () => {
    it('pension employee = 8% of gross (PenCom 2014 Act)', () => {
      const { pensionEmployee } = computeStatutoryDeductions(100_000, 60_000);
      expect(pensionEmployee).toBe(8_000); // 8% of 100,000
    });

    it('pension employer = 10% of gross', () => {
      const { pensionEmployer } = computeStatutoryDeductions(100_000, 60_000);
      expect(pensionEmployer).toBe(10_000); // 10% of 100,000
    });

    it('NHF = 2.5% of BASIC salary (not gross)', () => {
      const { nhfDeduction } = computeStatutoryDeductions(100_000, 60_000);
      expect(nhfDeduction).toBe(1_500); // 2.5% of 60,000 basic
    });
  });

  describe('computePayslip() — full computation', () => {
    const params = {
      basicSalary:           100_000,
      housingAllowancePct:   15,
      transportAllowancePct: 10,
      medicalAllowancePct:   5,
      additionalAllowances:  5_000,
      additionalDeductions:  2_000,
    };

    it('computes gross = basic + all allowances', () => {
      const p = computePayslip(params);
      // 100k + 15k + 10k + 5k + 5k = 135k
      expect(p.grossPay).toBe(135_000);
    });

    it('housing allowance = 15% of basic', () => {
      const p = computePayslip(params);
      expect(p.housingAllowance).toBe(15_000);
    });

    it('net pay = gross - total deductions', () => {
      const p = computePayslip(params);
      expect(p.netPay).toBeCloseTo(p.grossPay - p.totalDeductions, 2);
    });

    it('net pay is always positive for valid salary ranges', () => {
      const p = computePayslip(params);
      expect(p.netPay).toBeGreaterThan(0);
    });
  });

  describe('IPPIS CSV format', () => {
    it('header has correct column count (19 columns)', () => {
      const cols = IPPIS_CSV_HEADER.split(',');
      expect(cols).toHaveLength(19);
    });

    it('row has same column count as header', () => {
      const p = computePayslip({
        basicSalary: 80_000, housingAllowancePct: 15, transportAllowancePct: 10,
        medicalAllowancePct: 5, additionalAllowances: 0, additionalDeductions: 0,
      });
      const row = formatIppisRow(
        { ippisNo: '12345', lastName: 'OKONKWO', firstName: 'CHUKWU',
          gradeLevel: 'GL-07', step: 5, accountNumber: '0123456789', bankCode: '058' },
        p,
      );
      expect(row.split(',').length).toBe(IPPIS_CSV_HEADER.split(',').length);
    });

    it('amounts are formatted to 2 decimal places', () => {
      const p = computePayslip({
        basicSalary: 100_000, housingAllowancePct: 15, transportAllowancePct: 10,
        medicalAllowancePct: 5, additionalAllowances: 333.333, additionalDeductions: 0,
      });
      const row = formatIppisRow(
        { ippisNo: '12345', lastName: 'BELLO', firstName: 'AMINU',
          gradeLevel: 'GL-09', step: 3, accountNumber: '0987654321', bankCode: '011' },
        p,
      );
      const parts = row.split(',');
      parts.slice(5, 17).forEach((val) => {
        expect(val).toMatch(/^\d+\.\d{2}$/);
      });
    });

    it('staff names are uppercased in IPPIS output', () => {
      const p = computePayslip({ basicSalary: 50_000, housingAllowancePct: 15, transportAllowancePct: 10, medicalAllowancePct: 5, additionalAllowances: 0, additionalDeductions: 0 });
      const row = formatIppisRow({ ippisNo: '99', lastName: 'Ibrahim', firstName: 'Suleiman', gradeLevel: 'GL-05', step: 1, accountNumber: '1234567890', bankCode: '033' }, p);
      expect(row).toContain('IBRAHIM');
      expect(row).toContain('SULEIMAN');
    });
  });

  describe('PenCom CSV format', () => {
    it('header has 7 columns', () => {
      expect(PENCOM_CSV_HEADER.split(',').length).toBe(7);
    });

    it('employee + employer contributions sum to total', () => {
      const p = computePayslip({ basicSalary: 100_000, housingAllowancePct: 15, transportAllowancePct: 10, medicalAllowancePct: 5, additionalAllowances: 0, additionalDeductions: 0 });
      const row = formatPencomRow({ rsaPin: 'PEN123456789', lastName: 'ADEYEMI', firstName: 'FUNMILAYO', pfaCode: 'ACS001' }, p);
      const [,,,, eeStr, erStr, totalStr] = row.split(',') as string[];
      const ee = parseFloat(eeStr!), er = parseFloat(erStr!), total = parseFloat(totalStr!);
      expect(Math.abs(ee + er - total)).toBeLessThan(0.01);
    });
  });
});

// ── PayrollService integration tests ───────────────────────────────────────────
describe('PayrollService', () => {
  let svc: PayrollService;
  let prisma: Record<string, Record<string, jest.Mock>> & { $transaction: jest.Mock };
  let audit: jest.Mocked<AuditService>;

  beforeEach(async () => {
    prisma = {
      payrollRun: {
        findUnique:        jest.fn().mockResolvedValue(null),
        findUniqueOrThrow: jest.fn().mockResolvedValue(makeRun()),
        create:            jest.fn().mockResolvedValue(makeRun()),
        update:            jest.fn().mockResolvedValue(makeRun({ status: PayrollStatus.COMPUTED })),
        updateMany:        jest.fn(),
        findMany:          jest.fn().mockResolvedValue([]),
      },
      staff: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'staff-1', ippisNo: 'IPPIS001', lastName: 'Adeyemi', firstName: 'Funmi',
          employmentStatus: 'ACTIVE', bankCode: '058',
          accountNumber: null, // skip decryption in test
          salaryGrade: {
            basicSalary:           new FakeDecimal(150_000),
            housingAllowancePct:   new FakeDecimal(15),
            transportAllowancePct: new FakeDecimal(10),
            medicalAllowancePct:   new FakeDecimal(5),
            gradeLevel: 'GL-09', step: 3,
          },
          allowances: [],
        }]),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          lastName: 'Adeyemi', firstName: 'Funmi', bankCode: '058',
          accountNumber: null, rsaPin: null, pfaCode: null,
          salaryGrade: { step: 3 },
        }),
      },
      payslip: {
        upsert:  jest.fn().mockResolvedValue({ id: 'ps-1' }),
        findMany: jest.fn().mockResolvedValue([{
          id: 'ps-1', staffId: 'staff-1', payrollRunId: 'run-1', ippisNo: 'IPPIS001',
          gradeLevel: 'GL-09',
          basicSalary: new FakeDecimal(150_000), housingAllowance: new FakeDecimal(22_500),
          transportAllowance: new FakeDecimal(15_000), medicalAllowance: new FakeDecimal(7_500),
          otherAllowances: new FakeDecimal(0), grossPay: new FakeDecimal(195_000),
          payeeTax: new FakeDecimal(8_000), pensionEmployee: new FakeDecimal(15_600),
          pensionEmployer: new FakeDecimal(19_500), nhfDeduction: new FakeDecimal(3_750),
          nhisDeduction: new FakeDecimal(2_625), otherDeductions: new FakeDecimal(0),
          totalDeductions: new FakeDecimal(29_975), netPay: new FakeDecimal(165_025),
          staff: { firstName: 'Funmi', lastName: 'Adeyemi', employeeNo: 'EMP001', ippisNo: 'IPPIS001' },
          payrollRun: { label: 'October 2025', periodMonth: 10, periodYear: 2025 },
        }]),
      },
      $transaction: jest.fn((fn: Function) => fn(prisma)),
    } as never;
    audit = { log: jest.fn() } as unknown as jest.Mocked<AuditService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayrollService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService,  useValue: audit },
      ],
    }).compile();
    svc = module.get<PayrollService>(PayrollService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('createRun()', () => {
    it('creates a payroll run in DRAFT status', async () => {
      const result = await svc.createRun({ periodMonth: 10, periodYear: 2025, label: 'October 2025' }, 'bursar-1');
      expect(result.status).toBe(PayrollStatus.DRAFT);
      expect(audit.log).toHaveBeenCalledWith(expect.objectContaining({ action: 'CREATE' }), 'bursar-1');
    });

    it('rejects duplicate period (same month + year)', async () => {
      prisma.payrollRun.findUnique.mockResolvedValueOnce(makeRun());
      await expect(svc.createRun({ periodMonth: 10, periodYear: 2025, label: 'Oct 2025' }, 'bursar-1'))
        .rejects.toThrow(ConflictException);
    });
  });

  describe('applyAction() — payroll FSM', () => {
    it('COMPUTE: generates payslips and advances to COMPUTED', async () => {
      const result = await svc.applyAction('run-1', { action: 'COMPUTE' }, 'bursar-1');
      expect(prisma.payslip.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.payrollRun.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: PayrollStatus.COMPUTED }),
      }));
    });

    it('COMPUTE rejected if not in DRAFT status', async () => {
      prisma.payrollRun.findUniqueOrThrow.mockResolvedValueOnce(makeRun({ status: PayrollStatus.COMPUTED }));
      await expect(svc.applyAction('run-1', { action: 'COMPUTE' }, 'bursar-1'))
        .rejects.toThrow(UnprocessableEntityException);
    });

    it('APPROVE advances COMPUTED → APPROVED', async () => {
      prisma.payrollRun.findUniqueOrThrow.mockResolvedValueOnce(makeRun({ status: PayrollStatus.COMPUTED }));
      prisma.payrollRun.update.mockResolvedValueOnce(makeRun({ status: PayrollStatus.APPROVED }));
      const result = await svc.applyAction('run-1', { action: 'APPROVE' }, 'payroll-approver-1');
      expect(prisma.payrollRun.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: PayrollStatus.APPROVED }),
      }));
    });

    it('APPROVE rejects the payroll initiator as a self-approver', async () => {
      prisma.payrollRun.findUniqueOrThrow.mockResolvedValueOnce(makeRun({ status: PayrollStatus.COMPUTED, initiatedById: 'bursar-1' }));
      await expect(svc.applyAction('run-1', { action: 'APPROVE' }, 'bursar-1'))
        .rejects.toThrow(UnprocessableEntityException);
      expect(prisma.payrollRun.update).not.toHaveBeenCalled();
    });

    it('APPROVE rejected if not in COMPUTED status', async () => {
      prisma.payrollRun.findUniqueOrThrow.mockResolvedValueOnce(makeRun({ status: PayrollStatus.DRAFT }));
      await expect(svc.applyAction('run-1', { action: 'APPROVE' }, 'bursar-1'))
        .rejects.toThrow(UnprocessableEntityException);
    });

    it('DISBURSE advances APPROVED → DISBURSED', async () => {
      prisma.payrollRun.findUniqueOrThrow.mockResolvedValueOnce(makeRun({ status: PayrollStatus.APPROVED }));
      prisma.payrollRun.update.mockResolvedValueOnce(makeRun({ status: PayrollStatus.DISBURSED }));
      await svc.applyAction('run-1', { action: 'DISBURSE' }, 'bursar-1');
      expect(prisma.payrollRun.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ status: PayrollStatus.DISBURSED }),
      }));
    });

    it('DISBURSE rejected if not in APPROVED status', async () => {
      prisma.payrollRun.findUniqueOrThrow.mockResolvedValueOnce(makeRun({ status: PayrollStatus.COMPUTED }));
      await expect(svc.applyAction('run-1', { action: 'DISBURSE' }, 'bursar-1'))
        .rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('generateIppisCsv()', () => {
    it('rejects export for DRAFT payroll run', async () => {
      prisma.payrollRun.findUniqueOrThrow.mockResolvedValueOnce(makeRun({ status: PayrollStatus.DRAFT }));
      await expect(svc.generateIppisCsv('run-1', 'bursar-1')).rejects.toThrow(UnprocessableEntityException);
    });

    it('generates CSV with correct header as first row', async () => {
      prisma.payrollRun.findUniqueOrThrow.mockResolvedValueOnce(makeRun({ status: PayrollStatus.APPROVED }));
      const csv = await svc.generateIppisCsv('run-1', 'bursar-1');
      const firstLine = csv.split('\n')[0];
      expect(firstLine).toBe(IPPIS_CSV_HEADER);
    });

    it('records IPPIS export timestamp after generation', async () => {
      prisma.payrollRun.findUniqueOrThrow.mockResolvedValueOnce(makeRun({ status: PayrollStatus.APPROVED }));
      await svc.generateIppisCsv('run-1', 'bursar-1');
      expect(prisma.payrollRun.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ ippisExportedAt: expect.any(Date) }),
      }));
    });
  });
});
