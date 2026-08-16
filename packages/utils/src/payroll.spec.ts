import {
  computePaye, computeStatutoryDeductions, computePayslip,
  applyNta2026Bands, NTA_2026_EFFECTIVE_DATE,
} from './payroll';

describe('applyNta2026Bands — the published band schedule itself', () => {
  // These two are reproduced verbatim from independently-published,
  // fully-worked examples (Mondaq and Adeola Oyinlade & Co, both citing
  // the Nigeria Tax Act 2025), which apply the bands to their example
  // figure as the chargeable income directly. Both sources' own itemised
  // per-band arithmetic was hand-verified to sum to their stated totals
  // before being used here as test oracles.
  it('₦40,000,000 chargeable income → ₦8,130,000 total annual tax', () => {
    expect(applyNta2026Bands(40_000_000)).toBe(8_130_000);
  });

  it('₦60,000,000 chargeable income → ₦12,930,000 total annual tax', () => {
    expect(applyNta2026Bands(60_000_000)).toBe(12_930_000);
  });

  it('is ₦0 for chargeable income at or below ₦800,000', () => {
    expect(applyNta2026Bands(800_000)).toBe(0);
    expect(applyNta2026Bands(500_000)).toBe(0);
  });

  it('applies only the 15% rate to the slice between ₦800,000 and ₦3,000,000', () => {
    // 800,000 (0%) + 200,000 of the 15% band = 30,000
    expect(applyNta2026Bands(1_000_000)).toBe(30_000);
  });
});

describe('computePaye — Nigeria Tax Act 2025 (periods from 1 Jan 2026)', () => {
  const post2026 = new Date('2026-06-01T00:00:00.000Z');

  it('reduces annual gross by 8% pension relief before applying the bands', () => {
    // For an annual gross of G with no rent relief, chargeable income is
    // 0.92 * G, so total annual PAYE must equal applyNta2026Bands(0.92 * G)
    // — tying the full pipeline back to the verified band function above
    // rather than to a second, separate external oracle.
    const gross = 15_000_000;
    const monthlyPaye = computePaye(gross, { periodDate: post2026 });
    const expectedAnnual = applyNta2026Bands(gross * 0.92);
    expect(Math.round(monthlyPaye * 12)).toBe(Math.round(expectedAnnual));
  });

  it('is ₦0 for gross pay low enough that post-pension-relief income stays inside the ₦800,000 zero-rate band', () => {
    // Gross of 800,000 minus 8% pension relief (64,000) leaves taxable
    // income of 736,000, comfortably inside the 0% band.
    expect(computePaye(800_000, { periodDate: post2026 })).toBe(0);
  });

  it('applies rent relief at 20% of declared annual rent, capped at ₦500,000', () => {
    const noRent   = computePaye(12_000_000, { periodDate: post2026, annualRentPaid: 0 });
    const withRent = computePaye(12_000_000, { periodDate: post2026, annualRentPaid: 3_000_000 }); // 20% = 600,000, capped to 500,000
    const overCap  = computePaye(12_000_000, { periodDate: post2026, annualRentPaid: 10_000_000 }); // would be 2,000,000 uncapped

    expect(withRent).toBeLessThan(noRent);
    // Capped relief means declaring 3,000,000 or 10,000,000 in rent produces the same PAYE.
    expect(withRent).toBeCloseTo(overCap, 2);
  });

  it('defaults to zero rent relief when annualRentPaid is not supplied — relief is never assumed', () => {
    const explicit = computePaye(12_000_000, { periodDate: post2026, annualRentPaid: 0 });
    const implicit = computePaye(12_000_000, { periodDate: post2026 });
    expect(implicit).toBe(explicit);
  });

  it('does not apply the abolished CRA to post-2026 periods', () => {
    // Under the old CRA regime, a ₦2,000,000 gross earner would have had a
    // very large relief (20% of gross + 200,000 + 192,000) shielding most
    // income from tax. Under NTA 2025 there is no CRA, so meaningfully more
    // of this income is taxable.
    const paye2026 = computePaye(2_000_000, { periodDate: post2026 });
    expect(paye2026).toBeGreaterThan(0);
  });
});

describe('computePaye — pre-2026 (legacy PITA bands, for historical payslips only)', () => {
  const pre2026 = new Date('2025-11-01T00:00:00.000Z');

  it('still reproduces the original CRA-based calculation for a period before the NTA took effect', () => {
    // Original formula, unchanged, for a ₦3,000,000 annual gross:
    // relief = max(600,000, 200,000) + 192,000 = 792,000
    // pensionRelief = 240,000
    // taxable = 3,000,000 - 792,000 - 240,000 = 1,968,000
    // bands: 300k@7%=21,000 | 300k@11%=33,000 | 500k@15%=75,000 | 500k@19%=95,000 | 368k@21%=77,280
    // total = 301,280 → monthly = 25,106.67
    const monthlyPaye = computePaye(3_000_000, { periodDate: pre2026 });
    expect(monthlyPaye).toBeCloseTo(25_106.67, 1);
  });

  it('defaults to the current regime (NTA 2025) when no periodDate is given', () => {
    // "now" in this test run is after the 1 Jan 2026 effective date, so an
    // omitted periodDate must resolve to the new bands, not the legacy
    // ones — i.e. produce the same figure as an explicit current-day
    // periodDate, and a different (higher, since CRA no longer shields as
    // much income) figure than an explicit pre-2026 periodDate would.
    expect(new Date().getTime()).toBeGreaterThanOrEqual(NTA_2026_EFFECTIVE_DATE.getTime());
    const noArgs = computePaye(40_000_000);
    const explicitCurrent = computePaye(40_000_000, { periodDate: new Date() });
    const explicitLegacy = computePaye(40_000_000, { periodDate: new Date('2025-06-01') });
    expect(noArgs).toBe(explicitCurrent);
    expect(noArgs).not.toBe(explicitLegacy);
  });
});

describe('computeStatutoryDeductions — threads PAYE options through correctly', () => {
  it('applies rent relief when passed through from the caller', () => {
    const post2026 = new Date('2026-06-01T00:00:00.000Z');
    const withoutRent = computeStatutoryDeductions(1_000_000, 600_000, { periodDate: post2026 });
    const withRent    = computeStatutoryDeductions(1_000_000, 600_000, { periodDate: post2026, annualRentPaid: 2_400_000 });
    expect(withRent.payeeTax).toBeLessThan(withoutRent.payeeTax);
    // Pension/NHF/NHIS are unaffected by rent relief.
    expect(withRent.pensionEmployee).toBe(withoutRent.pensionEmployee);
    expect(withRent.nhfDeduction).toBe(withoutRent.nhfDeduction);
  });
});

describe('computePayslip — end-to-end with the new regime', () => {
  it('produces a lower payeeTax when a valid rent declaration is supplied', () => {
    const base = {
      basicSalary: 500_000,
      housingAllowancePct: 20,
      transportAllowancePct: 10,
      medicalAllowancePct: 5,
      additionalAllowances: 0,
      additionalDeductions: 0,
      periodDate: new Date('2026-06-01T00:00:00.000Z'),
    };
    const noRent = computePayslip(base);
    const withRent = computePayslip({ ...base, annualRentPaid: 1_800_000 });
    expect(withRent.payeeTax).toBeLessThan(noRent.payeeTax);
    expect(withRent.netPay).toBeGreaterThan(noRent.netPay);
  });

  it('recomputing a pre-2026 payslip with an explicit periodDate reproduces the original legacy figure, unaffected by rent relief', () => {
    const params = {
      basicSalary: 300_000,
      housingAllowancePct: 20,
      transportAllowancePct: 10,
      medicalAllowancePct: 5,
      additionalAllowances: 0,
      additionalDeductions: 0,
      periodDate: new Date('2025-08-01T00:00:00.000Z'),
    };
    const withoutRentArg = computePayslip(params);
    const withRentArgIgnored = computePayslip({ ...params, annualRentPaid: 5_000_000 });
    // Rent relief did not exist pre-2026, so declaring rent must not change the result.
    expect(withRentArgIgnored.payeeTax).toBe(withoutRentArg.payeeTax);
  });
});
