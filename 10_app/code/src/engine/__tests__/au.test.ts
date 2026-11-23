import { describe, expect, it } from 'vitest';
import { auPerson } from '../au';

describe('Australian tax, 2026-27', () => {
  it('taxes $90,000 as the ATO table does', () => {
    // $4,020 + 30% of $45,000 = $17,520; LITO 0 at $90,000; Medicare levy 2% = $1,800
    const r = auPerson(90000);
    expect(r.income).toBeCloseTo(17520, 2);
    expect(r.medicare).toBeCloseTo(1800, 2);
  });
  it('applies the low income tax offset', () => {
    // (30,000 - 18,200) x 15% = 1,770, less the $700 offset
    expect(auPerson(30000).income).toBeCloseTo(1070, 2);
  });
});

import { auTax } from '../au';
describe('super after 60', () => {
  it('leaves super withdrawals untaxed at 60', () => {
    const base = { year: 2026, status: 'single', index: 1, wages: 0, selfEmployment: 0, otherOrdinary: 80000, interest: 0, qualifiedDividends: 0, longTermGains: 0, socialSecurity: 0, preTaxDeductions: 0, earlyWithdrawals: 0, over65: 0 } as any;
    expect(auTax({ ...base, over60: 1 }).total).toBe(0);
    expect(auTax({ ...base, over60: 0 }).total).toBeGreaterThan(10000);
  });
});
