import {
  BadRequestException, ConflictException, Injectable, Logger,
  StreamableFile, UnprocessableEntityException,
} from '@nestjs/common';
import { AuditAction, EmploymentStatus, PayrollStatus } from '@prisma/client';
import { decryptPii } from '@uniportal/utils';
import {
  computePayslip, formatIppisRow, formatPencomRow,
  IPPIS_CSV_HEADER, PENCOM_CSV_HEADER,
} from '@uniportal/utils';
import { AuditService } from '../../common/audit/audit.service';
import { PrismaService } from '../../database/prisma.service';
import type { CreatePayrollRunDto, PayrollActionDto } from './dto/payroll.dto';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit:  AuditService,
  ) {}

  // ── Payroll Run CRUD ───────────────────────────────────────────────────────
  async createRun(dto: CreatePayrollRunDto, actorId: string) {
    const existing = await this.prisma.payrollRun.findUnique({
      where: { uq_payroll_run_period: { periodMonth: dto.periodMonth, periodYear: dto.periodYear } },
    });
    if (existing) throw new ConflictException({
      code: 'DUPLICATE_RESOURCE',
      message: `Payroll run for ${dto.label} already exists (status: ${existing.status})`,
    });

    const run = await this.prisma.payrollRun.create({
      data: {
        periodMonth: dto.periodMonth, periodYear: dto.periodYear,
        label: dto.label, status: PayrollStatus.DRAFT,
        notes: dto.notes ?? null, initiatedById: actorId,
      },
    });
    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'payroll_runs', targetId: run.id,
      newValues: { label: dto.label },
    }, actorId);
    return run;
  }

  async findAll(year?: number) {
    return this.prisma.payrollRun.findMany({
      where:   year ? { periodYear: year } : undefined,
      include: { _count: { select: { payslips: true } } },
      orderBy: [{ periodYear: 'desc' }, { periodMonth: 'desc' }],
    });
  }

  // ── FSM: COMPUTE → APPROVE → DISBURSE ─────────────────────────────────────
  async applyAction(runId: string, dto: PayrollActionDto, actorId: string) {
    // P0-11 FIX (this pass — see docs/CHANGELOG.md): this used to
    // fetch `run` here first, then use only `run.id` (always identical to
    // the `runId` parameter already in scope) to dispatch. Each handler
    // below ALSO independently re-fetches the same row by the same id to
    // do its actual status check — so every payroll action ran two
    // identical queries where one suffices, and the redundant first fetch
    // is exactly what made payroll.service.spec.ts's per-test
    // `mockResolvedValueOnce(...)` overrides land on the WRONG call (the
    // throwaway dispatcher read, not the handler's real validation read),
    // silently defeating 3 of this file's own tests regardless of
    // environment. Dispatching on `runId` directly removes both the extra
    // query and the trap.
    switch (dto.action) {
      case 'COMPUTE':  return this.computePayroll(runId, actorId);
      case 'APPROVE':  return this.approvePayroll(runId, actorId);
      case 'DISBURSE': return this.disbursePayroll(runId, actorId);
      default: throw new BadRequestException(`Unknown action: ${dto.action}`);
    }
  }

  /** DRAFT → COMPUTED: generates a Payslip row for every ACTIVE staff member */
  private async computePayroll(runId: string, actorId: string) {
    const run = await this.prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
    if (run.status !== PayrollStatus.DRAFT) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Cannot compute a payroll run in status "${run.status}"`,
      });
    }

    // P10 PARTITIONING: `payslips` is RANGE-partitioned by payPeriodDate (see
    // Payslip model doc). Derived from the run's own period fields so it is
    // IDENTICAL on every retry of this method — a partially-failed run that
    // gets recomputed must upsert the same payPeriodDate, or the partitioned
    // uq_payslip_staff_run constraint would treat the retry as a new row
    // instead of catching the duplicate.
    const payPeriodDate = new Date(Date.UTC(run.periodYear, run.periodMonth - 1, 1));

    const activeStaff = await this.prisma.staff.findMany({
      where: { employmentStatus: { in: [EmploymentStatus.ACTIVE, EmploymentStatus.ON_LEAVE] } },
      include: {
        salaryGrade: true,
        allowances:  {
          where: {
            isRecurring: true,
            // B-P6-3 fix: include both open-ended AND future-dated allowances.
            // effectiveTo: null catches permanent allowances (no end date).
            // effectiveTo: { gte: new Date() } catches fixed-term allowances still active today.
            // Previously: effectiveTo: null silently excluded loan repayments like "GL-07
            // Medical Allowance until 2026-12-31", causing understated gross pay.
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: new Date() } },
            ],
          },
        },
      },
    });

    let totalGross = 0, totalNet = 0, totalDeductions = 0;

    for (const staff of activeStaff) {
      const grade = staff.salaryGrade;
      const extraAllowances = staff.allowances
        .filter((a) => a.type === 'ALLOWANCE')
        .reduce((s, a) => s + a.amount.toNumber(), 0);
      const extraDeductions = staff.allowances
        .filter((a) => ['DEDUCTION','LOAN_REPAYMENT','UNION_DUES'].includes(a.type))
        .reduce((s, a) => s + a.amount.toNumber(), 0);

      const computed = computePayslip({
        basicSalary:           grade.basicSalary.toNumber(),
        housingAllowancePct:   grade.housingAllowancePct.toNumber(),
        transportAllowancePct: grade.transportAllowancePct.toNumber(),
        medicalAllowancePct:   grade.medicalAllowancePct.toNumber(),
        additionalAllowances:  extraAllowances,
        additionalDeductions:  extraDeductions,
        // Deep-audit fix (Aug 2026): PAYE must use the statutory regime in
        // force for the run's OWN period, not whatever regime happens to be
        // current on the day this computation actually executes. Reusing
        // payPeriodDate (already derived above for partition-key purposes)
        // means re-running a 2025 payroll month after 1 Jan 2026 still
        // correctly applies the old CRA/bands, and any run from 1 Jan 2026
        // onward correctly applies the Nigeria Tax Act 2025 bands.
        // annualRentPaid intentionally omitted (defaults to 0, i.e. no
        // relief assumed): this system has no field yet to capture a
        // staff member's declared, evidenced annual rent. Once one exists
        // (see StaffAllowance or a dedicated Staff field), thread it
        // through here so eligible staff actually receive the relief
        // they're entitled to rather than silently forgoing it.
        periodDate: payPeriodDate,
      });

      await this.prisma.payslip.upsert({
        where: { uq_payslip_staff_run: { staffId: staff.id, payrollRunId: runId, payPeriodDate } },
        create: {
          staffId:             staff.id,
          payrollRunId:        runId,
          payPeriodDate,
          basicSalary:         computed.basicSalary,
          housingAllowance:    computed.housingAllowance,
          transportAllowance:  computed.transportAllowance,
          medicalAllowance:    computed.medicalAllowance,
          otherAllowances:     computed.otherAllowances,
          grossPay:            computed.grossPay,
          payeeTax:            computed.payeeTax,
          pensionEmployee:     computed.pensionEmployee,
          pensionEmployer:     computed.pensionEmployer,
          nhfDeduction:        computed.nhfDeduction,
          nhisDeduction:       computed.nhisDeduction,
          otherDeductions:     computed.otherDeductions,
          totalDeductions:     computed.totalDeductions,
          netPay:              computed.netPay,
          gradeLevel:          grade.gradeLevel,
          ippisNo:             staff.ippisNo ?? null,
        },
        update: {
          basicSalary: computed.basicSalary, grossPay: computed.grossPay,
          netPay: computed.netPay, totalDeductions: computed.totalDeductions,
        },
      });

      totalGross      += computed.grossPay;
      totalNet        += computed.netPay;
      totalDeductions += computed.totalDeductions;
    }

    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data: {
        status:     PayrollStatus.COMPUTED,
        totalGross: Math.round(totalGross * 100) / 100,
        totalNet:   Math.round(totalNet * 100) / 100,
        totalDeductions: Math.round(totalDeductions * 100) / 100,
        staffCount: activeStaff.length,
      },
    });

    this.logger.log(
      `Payroll computed: ${run.label} — ${activeStaff.length} staff, ` +
      `gross ₦${totalGross.toFixed(2)}, net ₦${totalNet.toFixed(2)}`
    );
    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'payroll_runs', targetId: runId,
      newValues: { status: 'COMPUTED', staffCount: activeStaff.length, totalNet },
    }, actorId);
    return updated;
  }

  private async approvePayroll(runId: string, actorId: string) {
    const run = await this.prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
    if (run.status !== PayrollStatus.COMPUTED)
      throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: `Payroll must be COMPUTED before approval (current: ${run.status})` });

    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data:  { status: PayrollStatus.APPROVED, approvedById: actorId, approvedAt: new Date() },
    });
    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'payroll_runs', targetId: runId,
      newValues: { status: 'APPROVED' },
    }, actorId);
    return updated;
  }

  private async disbursePayroll(runId: string, actorId: string) {
    const run = await this.prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
    if (run.status !== PayrollStatus.APPROVED)
      throw new UnprocessableEntityException({ code: 'BUSINESS_RULE_INVALID_STATE', message: `Payroll must be APPROVED before disbursement (current: ${run.status})` });

    const updated = await this.prisma.payrollRun.update({
      where: { id: runId },
      data:  { status: PayrollStatus.DISBURSED, disbursedAt: new Date() },
    });
    await this.audit.log({
      action: AuditAction.UPDATE, targetTable: 'payroll_runs', targetId: runId,
      newValues: { status: 'DISBURSED' },
    }, actorId);
    return updated;
  }

  // ── Payslip queries ────────────────────────────────────────────────────────
  async getPayslipsForRun(runId: string) {
    // H-P6-4 fix: Pre-load all staff fields needed by IPPIS/PenCom exports
    // in this single query. Previously, generateIppisCsv() / generatePencomCsv()
    // called prisma.staff.findUniqueOrThrow() inside a for-each loop over payslips
    // — 401 sequential queries for a 400-staff payroll. Now: 1 query total.
    return this.prisma.payslip.findMany({
      where:   { payrollRunId: runId },
      include: {
        staff: {
          select: {
            firstName: true, lastName: true, employeeNo: true, ippisNo: true,
            // IPPIS export fields
            accountNumber: true, bankCode: true,
            // PenCom export fields
            rsaPin: true, pfaCode: true,
            // Grade step (for IPPIS)
            salaryGrade: { select: { step: true } },
          },
        },
      },
      orderBy: { staff: { lastName: 'asc' } },
    });
  }

  async getStaffPayslips(staffId: string, year?: number) {
    return this.prisma.payslip.findMany({
      where:   { staffId, ...(year ? { payrollRun: { periodYear: year } } : {}) },
      include: { payrollRun: { select: { label: true, periodMonth: true, periodYear: true } } },
      orderBy: [{ payrollRun: { periodYear: 'desc' } }, { payrollRun: { periodMonth: 'desc' } }],
    });
  }

  // ── Export: IPPIS CSV ──────────────────────────────────────────────────────
  /**
   * Generates IPPIS-format CSV for a COMPUTED/APPROVED/DISBURSED payroll run.
   * S3 NOTE: Column order follows FGN IPPIS Technical Implementation Guide (2023).
   * Confirm with IPPIS Integration Unit before first submission.
   */
  async generateIppisCsv(runId: string, actorId: string): Promise<string> {
    await this.assertExportable(runId);
    const payslips = await this.getPayslipsForRun(runId);

    const rows = [IPPIS_CSV_HEADER];
    for (const p of payslips) {
      if (!p.ippisNo) continue; // skip non-IPPIS staff
      const staff = await this.prisma.staff.findUniqueOrThrow({
        where: { id: p.staffId },
        select: { ippisNo: true, lastName: true, firstName: true, accountNumber: true, bankCode: true, salaryGrade: { select: { step: true } } },
        // B-P6-2 fix: gradeLevel is NOT a Staff column — it lives on SalaryGrade.
        // formatIppisRow() reads p.gradeLevel from the Payslip snapshot (correct).
        // Selecting gradeLevel from Staff causes TypeScript CI failure.
      });

      let accountNo = '';
      try { if (staff.accountNumber) accountNo = decryptPii(staff.accountNumber); } catch { /* non-critical */ }

      rows.push(formatIppisRow(
        {
          ippisNo: p.ippisNo!, lastName: staff.lastName, firstName: staff.firstName,
          gradeLevel: p.gradeLevel, step: staff.salaryGrade?.step ?? 1,
          accountNumber: accountNo, bankCode: staff.bankCode ?? '',
        },
        {
          basicSalary: p.basicSalary.toNumber(), housingAllowance: p.housingAllowance.toNumber(),
          transportAllowance: p.transportAllowance.toNumber(), medicalAllowance: p.medicalAllowance.toNumber(),
          otherAllowances: p.otherAllowances.toNumber(), grossPay: p.grossPay.toNumber(),
          payeeTax: p.payeeTax.toNumber(), pensionEmployee: p.pensionEmployee.toNumber(),
          pensionEmployer: p.pensionEmployer.toNumber(), nhfDeduction: p.nhfDeduction.toNumber(),
          nhisDeduction: p.nhisDeduction.toNumber(), otherDeductions: p.otherDeductions.toNumber(),
          totalDeductions: p.totalDeductions.toNumber(), netPay: p.netPay.toNumber(),
        },
      ));
    }

    await this.prisma.payrollRun.update({ where: { id: runId }, data: { ippisExportedAt: new Date() } });
    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'payroll_runs', targetId: runId,
      metadata: { type: 'IPPIS_EXPORT', rowCount: rows.length - 1 },
    }, actorId);

    return rows.join('\n');
  }

  // ── Export: PenCom CSV ────────────────────────────────────────────────────
  /**
   * Generates PenCom Schedule 3 CSV (pension remittance).
   * S4 NOTE: Confirm PFA-specific format variants before submission.
   */
  async generatePencomCsv(runId: string, actorId: string): Promise<string> {
    await this.assertExportable(runId);
    const payslips = await this.getPayslipsForRun(runId);

    const rows = [PENCOM_CSV_HEADER];
    for (const p of payslips) {
      // H-P6-4 fix: staff data pre-loaded in getPayslipsForRun() include
      const staff = p.staff;
      if (!staff) continue;
      if (!staff.rsaPin || !staff.pfaCode) continue;

      let rsaPin = '';
      try { rsaPin = decryptPii(staff.rsaPin); } catch { /* skip non-deryptable */ }
      if (!rsaPin) continue;

      rows.push(formatPencomRow(
        { rsaPin, lastName: staff.lastName, firstName: staff.firstName, pfaCode: staff.pfaCode },
        {
          basicSalary: p.basicSalary.toNumber(), housingAllowance: p.housingAllowance.toNumber(),
          transportAllowance: p.transportAllowance.toNumber(), medicalAllowance: p.medicalAllowance.toNumber(),
          otherAllowances: p.otherAllowances.toNumber(), grossPay: p.grossPay.toNumber(),
          payeeTax: p.payeeTax.toNumber(), pensionEmployee: p.pensionEmployee.toNumber(),
          pensionEmployer: p.pensionEmployer.toNumber(), nhfDeduction: p.nhfDeduction.toNumber(),
          nhisDeduction: p.nhisDeduction.toNumber(), otherDeductions: p.otherDeductions.toNumber(),
          totalDeductions: p.totalDeductions.toNumber(), netPay: p.netPay.toNumber(),
        },
      ));
    }

    await this.prisma.payrollRun.update({ where: { id: runId }, data: { pencomExportedAt: new Date() } });
    await this.audit.log({
      action: AuditAction.CREATE, targetTable: 'payroll_runs', targetId: runId,
      metadata: { type: 'PENCOM_EXPORT', rowCount: rows.length - 1 },
    }, actorId);

    return rows.join('\n');
  }

  private async assertExportable(runId: string) {
    const run = await this.prisma.payrollRun.findUniqueOrThrow({ where: { id: runId } });
    if (!['COMPUTED','APPROVED','DISBURSED'].includes(run.status)) {
      throw new UnprocessableEntityException({
        code: 'BUSINESS_RULE_INVALID_STATE',
        message: `Cannot export a ${run.status} payroll run — must be COMPUTED, APPROVED, or DISBURSED`,
      });
    }
  }
}
