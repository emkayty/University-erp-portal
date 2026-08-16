/**
 * Nigerian Payroll Computation Utilities
 *
 * Statutory rates (current):
 *  - Pension (PenCom 2014 Act): Employee 8%, Employer 10% of gross
 *  - NHF (National Housing Fund): 2.5% of basic salary (federal workers)
 *  - NHIS: typically 1.75% employee, 1.75% employer of basic
 *  - PAYE (Personal Income Tax): progressive bands under the Nigeria Tax Act
 *    2025 (NTA 2025), in force from 1 January 2026. See computePaye() below
 *    for the historical pre-2026 bands, kept only for recomputing payslips
 *    whose pay period predates the NTA.
 *
 * NTA 2025 summary (verified against KPMG's GMS Flash Alert 2025-168 and
 * cross-checked worked examples from independent Nigerian tax advisories,
 * Aug 2026):
 *  - The Consolidated Relief Allowance (CRA) is abolished outright — there
 *    is no automatic "20% of gross + ₦200,000" relief any more.
 *  - It is replaced by a rent relief: 20% of annual rent paid, capped at
 *    ₦500,000, claimable only where the employee has declared and evidenced
 *    the rent paid. Absent that declaration, the relief is ₦0 — it is never
 *    assumed.
 *  - Six bands apply to chargeable income (gross minus pension relief minus
 *    rent relief): 0% to ₦800,000, then 15/18/21/23/25% across widening
 *    bands up to a top rate of 25% above ₦50,000,000.
 *  - FIRS was renamed the Nigeria Revenue Service (NRS) under the NRS
 *    Establishment Act 2025; downstream code/exports should say NRS.
 *
 * NOTE: IPPIS exact column order and PenCom exact XML/CSV field names require
 * confirmation from the institution's signed integration agreement before
 * go-live. The formats here follow public FGN documentation and the
 * IPPIS Technical Implementation Guide (2023 revision).
 * See docs/EXTERNAL_INTEGRATION_CERTIFICATION.md before enabling either export in production.
 */

export interface GrossComponents {
  basicSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  medicalAllowance: number;
  otherAllowances: number;
  grossPay: number;
}

export interface StatutoryDeductions {
  payeeTax: number;
  pensionEmployee: number;   // 8% of gross
  pensionEmployer: number;   // 10% of gross
  nhfDeduction: number;      // 2.5% of basic
  nhisDeduction: number;     // 1.75% of basic
  totalDeductions: number;
}

export interface PayslipComputation extends GrossComponents, StatutoryDeductions {
  otherDeductions: number;   // loans, union dues, etc.
  netPay: number;
}

/** Compute gross components from basic salary + grade allowance percentages. */
export function computeGrossComponents(
  basicSalary: number,
  housingAllowancePct:   number,
  transportAllowancePct: number,
  medicalAllowancePct:   number,
  otherAllowancesAmount  = 0,
): GrossComponents {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const housing   = round2(basicSalary * housingAllowancePct   / 100);
  const transport = round2(basicSalary * transportAllowancePct / 100);
  const medical   = round2(basicSalary * medicalAllowancePct   / 100);
  const gross     = round2(basicSalary + housing + transport + medical + otherAllowancesAmount);
  return {
    basicSalary, housingAllowance: housing, transportAllowance: transport,
    medicalAllowance: medical, otherAllowances: otherAllowancesAmount, grossPay: gross,
  };
}

/** The Nigeria Tax Act 2025 took effect 1 January 2026 and replaced PITA's
 *  PAYE regime (CRA + the old 7–24% bands) outright. Any pay period from
 *  this date onward must use the new bands; anything before it must not. */
export const NTA_2026_EFFECTIVE_DATE = new Date('2026-01-01T00:00:00.000Z');

/**
 * Pre-2026 PAYE bands (PITA, as amended by the Finance Acts through 2023).
 * Kept ONLY so historical payslips (pay period before 1 Jan 2026) can be
 * recomputed or reprinted with the figures that were actually correct for
 * that period — tax law is not applied retroactively. Do not call this
 * directly from new payroll runs; use computePaye() with a periodDate,
 * which routes here automatically for pre-2026 periods.
 */
function computePayeLegacyPre2026(annualGross: number): number {
  // Consolidated Relief Allowance: 20% of gross + ₦200,000 (whichever is higher) + ₦16,000 per month
  const personalRelief    = Math.max(annualGross * 0.20, 200_000) + (16_000 * 12);
  const pensionRelief     = annualGross * 0.08; // employee pension contribution is tax-deductible
  const taxableIncome     = Math.max(0, annualGross - personalRelief - pensionRelief);

  // Progressive bands (annual)
  const bands: Array<[number, number]> = [
    [300_000,   0.07],
    [300_000,   0.11],
    [500_000,   0.15],
    [500_000,   0.19],
    [1_600_000, 0.21],
    [Infinity,  0.24],
  ];

  let tax = 0, remaining = taxableIncome;
  for (const [band, rate] of bands) {
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, band);
    tax += taxable * rate;
    remaining -= taxable;
  }

  return Math.round((tax / 12) * 100) / 100; // monthly PAYE
}

/**
 * Applies the NTA 2025 band schedule to an already-computed chargeable
 * (taxable) income and returns the ANNUAL tax — i.e. everything downstream
 * of reliefs. Exported separately from computePayeNta2026 because this is
 * specifically the piece independently-published worked examples verify:
 * given a chargeable income of ₦40,000,000, annual tax is ₦8,130,000;
 * given ₦60,000,000, it's ₦12,930,000. Both are reproduced exactly by this
 * function — see payroll.spec.ts. (Those examples illustrate the bracket
 * mechanics using their example figure as the chargeable-income input
 * directly; they are not full gross-to-net walkthroughs including the
 * pension/rent relief step, which computePayeNta2026 below adds.)
 */
export function applyNta2026Bands(chargeableIncome: number): number {
  const bands: Array<[number, number]> = [
    [800_000,    0.00],
    [2_200_000,  0.15],
    [9_000_000,  0.18],
    [13_000_000, 0.21],
    [25_000_000, 0.23],
    [Infinity,   0.25],
  ];

  let tax = 0, remaining = Math.max(0, chargeableIncome);
  for (const [band, rate] of bands) {
    if (remaining <= 0) break;
    const taxable = Math.min(remaining, band);
    tax += taxable * rate;
    remaining -= taxable;
  }
  return tax;
}

/**
 * Current PAYE bands under the Nigeria Tax Act 2025, effective 1 January
 * 2026. Computes chargeable income (gross minus the two reliefs the Act
 * still allows — employee pension contribution and, where declared and
 * evidenced, rent relief) and hands it to applyNta2026Bands().
 */
function computePayeNta2026(annualGross: number, annualRentPaid: number): number {
  const pensionRelief = annualGross * 0.08; // employee pension contribution remains tax-deductible
  // Rent relief replaces the CRA outright: 20% of declared, evidenced annual
  // rent, capped at ₦500,000. It is never assumed — an employee who has not
  // declared and evidenced rent paid gets ₦0 of this relief, by design.
  const rentRelief    = Math.min(Math.max(annualRentPaid, 0) * 0.20, 500_000);
  const taxableIncome = Math.max(0, annualGross - pensionRelief - rentRelief);

  const tax = applyNta2026Bands(taxableIncome);
  return Math.round((tax / 12) * 100) / 100; // monthly PAYE
}

/**
 * Compute monthly PAYE for the given annual gross pay.
 *
 * Selects the correct statutory regime by the pay period's date (defaults
 * to today, i.e. the regime in force right now), NOT by when this function
 * happens to be called — so recomputing a November 2025 payslip in 2027
 * still correctly uses the pre-NTA bands.
 *
 * @param annualGross    Annualised gross pay.
 * @param opts.periodDate     The pay period this PAYE figure is for.
 *                             Defaults to now.
 * @param opts.annualRentPaid Annual rent the employee has declared and
 *                             evidenced (NTA 2025 rent relief input).
 *                             Defaults to 0 — never assumed. Ignored for
 *                             pre-2026 periods, which have no rent relief.
 */
export function computePaye(
  annualGross: number,
  opts: { periodDate?: Date; annualRentPaid?: number } = {},
): number {
  const periodDate = opts.periodDate ?? new Date();
  if (periodDate.getTime() < NTA_2026_EFFECTIVE_DATE.getTime()) {
    return computePayeLegacyPre2026(annualGross);
  }
  return computePayeNta2026(annualGross, opts.annualRentPaid ?? 0);
}

/** Compute all statutory deductions for one staff member for one month. */
export function computeStatutoryDeductions(
  grossPay: number, basicSalary: number,
  payeOpts: { periodDate?: Date; annualRentPaid?: number } = {},
): StatutoryDeductions {
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const pensionEmployee = round2(grossPay * 0.08);  // PenCom: 8% of gross
  const pensionEmployer = round2(grossPay * 0.10);  // PenCom: 10% of gross
  const nhfDeduction    = round2(basicSalary * 0.025); // NHF: 2.5% of basic
  const nhisDeduction   = round2(basicSalary * 0.0175);
  const payeeTax        = computePaye(grossPay * 12, payeOpts); // annualise for band computation
  const totalDeductions = round2(payeeTax + pensionEmployee + nhfDeduction + nhisDeduction);
  return { payeeTax, pensionEmployee, pensionEmployer, nhfDeduction, nhisDeduction, totalDeductions };
}

/** Full payslip computation for one staff member. */
export function computePayslip(params: {
  basicSalary: number;
  housingAllowancePct: number;
  transportAllowancePct: number;
  medicalAllowancePct: number;
  additionalAllowances: number;
  additionalDeductions: number;
  /** The pay period this payslip is for. Defaults to now — pass the actual
   *  period date when recomputing a past payslip so the correct statutory
   *  regime (pre- or post-NTA 2025) is used. */
  periodDate?: Date;
  /** Annual rent the staff member has declared and evidenced, for the NTA
   *  2025 rent relief. Defaults to 0 (no relief) — never assumed. */
  annualRentPaid?: number;
}): PayslipComputation {
  const gross = computeGrossComponents(
    params.basicSalary, params.housingAllowancePct,
    params.transportAllowancePct, params.medicalAllowancePct,
    params.additionalAllowances,
  );
  const deductions = computeStatutoryDeductions(gross.grossPay, gross.basicSalary, {
    periodDate: params.periodDate,
    annualRentPaid: params.annualRentPaid,
  });
  const totalDed   = Math.round((deductions.totalDeductions + params.additionalDeductions) * 100) / 100;
  const netPay     = Math.round((gross.grossPay - totalDed) * 100) / 100;
  return { ...gross, ...deductions, otherDeductions: params.additionalDeductions,
           totalDeductions: totalDed, netPay };
}

// ── IPPIS Export Helpers ───────────────────────────────────────────────────────
/**
 * Formats one payslip row in the IPPIS CSV format (FGN IPPIS TIG 2023).
 *
 * Column order (per public IPPIS Technical Implementation Guide):
 * IPPIS_NO | LAST_NAME | FIRST_NAME | GRADE_LEVEL | STEP |
 * BASIC | HOUSING | TRANSPORT | MEDICAL | OTHER_ALLOWANCES |
 * GROSS | PAYE | PENSION_EE | NHF | OTHER_DEDUCTIONS |
 * TOTAL_DEDUCTIONS | NET_PAY | ACCOUNT_NUMBER | BANK_CODE
 *
 * TODO (pre-go-live, tracked in docs/EXTERNAL_INTEGRATION_CERTIFICATION.md):
 * Confirm exact column names with the IPPIS Integration Unit, OHCSF.
 * Column names and encoding (UTF-8 BOM vs ANSI) vary by batch type.
 */
export function formatIppisRow(staff: {
  ippisNo: string; lastName: string; firstName: string;
  gradeLevel: string; step: number; accountNumber: string; bankCode: string;
}, p: PayslipComputation): string {
  const f = (n: number) => n.toFixed(2);
  return [
    staff.ippisNo, staff.lastName.toUpperCase(), staff.firstName.toUpperCase(),
    staff.gradeLevel, staff.step,
    f(p.basicSalary), f(p.housingAllowance), f(p.transportAllowance),
    f(p.medicalAllowance), f(p.otherAllowances), f(p.grossPay),
    f(p.payeeTax), f(p.pensionEmployee), f(p.nhfDeduction),
    f(p.otherDeductions), f(p.totalDeductions), f(p.netPay),
    staff.accountNumber, staff.bankCode,
  ].join(',');
}

export const IPPIS_CSV_HEADER = [
  'IPPIS_NO','LAST_NAME','FIRST_NAME','GRADE_LEVEL','STEP',
  'BASIC','HOUSING','TRANSPORT','MEDICAL','OTHER_ALLOWANCES','GROSS',
  'PAYE','PENSION_EE','NHF','OTHER_DEDUCTIONS','TOTAL_DEDUCTIONS','NET_PAY',
  'ACCOUNT_NUMBER','BANK_CODE',
].join(',');

// ── PenCom Export Helpers ─────────────────────────────────────────────────────
/**
 * PenCom Schedule 3 CSV format (per PENCOM Guidelines 2022).
 *
 * TODO (pre-go-live, tracked in docs/EXTERNAL_INTEGRATION_CERTIFICATION.md):
 * Confirm PFA-specific field requirements with institution's chosen PFA.
 * Some PFAs require XML instead of CSV; field names differ across PFAs.
 */
export function formatPencomRow(staff: {
  rsaPin: string; lastName: string; firstName: string; pfaCode: string;
}, p: PayslipComputation): string {
  return [
    staff.rsaPin, staff.lastName.toUpperCase(), staff.firstName.toUpperCase(),
    staff.pfaCode,
    p.pensionEmployee.toFixed(2),  // employee 8%
    p.pensionEmployer.toFixed(2),  // employer 10%
    (p.pensionEmployee + p.pensionEmployer).toFixed(2), // total
  ].join(',');
}

export const PENCOM_CSV_HEADER = [
  'RSA_PIN','LAST_NAME','FIRST_NAME','PFA_CODE',
  'EMPLOYEE_CONTRIBUTION','EMPLOYER_CONTRIBUTION','TOTAL_CONTRIBUTION',
].join(',');
